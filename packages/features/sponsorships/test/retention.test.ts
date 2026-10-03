/**
 * The daily retention purge (ruling 9, J-04): exactly what the privacy
 * text promises and the plan lists, run twice for one effect, with a dry
 * run that counts and deletes nothing.
 */
import { env } from "cloudflare:workers";
import {
  AUDIT_RETENTION_MS,
  auditLog,
  paymentItem,
  session,
  sponsorship,
  verification,
} from "@smog/db";
import { makeUser } from "@smog/db/testing";
import { DAY_MS, newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ORPHAN_LOGO_MIN_AGE_MS,
  TERMINAL_LOGO_GRACE_MS,
} from "../src/server/orphan-logos";
import { runRetentionPurge } from "../src/server/sweeps";
import { clearBucket, clearSponsorships } from "./clean";
import { seedCheckout, sponsorshipRow, testDb } from "./helpers";

const db = testDb();
const media = env.MEDIA;

/** A `now` far enough ahead that every object put in this test is old. */
function later(): Date {
  return new Date(Date.now() + ORPHAN_LOGO_MIN_AGE_MS + 60_000);
}

async function put(key: string): Promise<void> {
  await media.put(key, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    httpMetadata: { contentType: "image/png" },
  });
}

async function keys(): Promise<string[]> {
  const listed = await media.list({ prefix: "logos/" });
  return listed.objects.map((object) => object.key).sort();
}

async function setUpdated(id: string, at: Date): Promise<void> {
  await db
    .update(sponsorship)
    .set({ updatedAt: at })
    .where(eq(sponsorship.id, id));
}

async function audit(createdAt: Date): Promise<string> {
  const id = newId();
  await db.insert(auditLog).values({
    action: "gesture.update",
    createdAt,
    data: {},
    id,
    targetId: "g",
    targetType: "gesture",
  });
  return id;
}

beforeEach(async () => {
  await clearSponsorships(db);
  await clearBucket(media);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM audit_log"),
    env.DB.prepare("DELETE FROM session"),
    env.DB.prepare("DELETE FROM verification"),
  ]);
});

describe("runRetentionPurge (J-04)", () => {
  it("keeps an audit entry 3 y − 1 ms old and deletes one 3 y + 1 ms old", async () => {
    const now = new Date("2026-10-03T03:15:00.000Z");
    const kept = await audit(new Date(now.getTime() - AUDIT_RETENTION_MS + 1));
    await audit(new Date(now.getTime() - AUDIT_RETENTION_MS - 1));

    const first = await runRetentionPurge({ db, media, now });
    const second = await runRetentionPurge({ db, media, now });

    expect(first.audit_log).toBe(1);
    expect(second.audit_log).toBe(0);
    const left = await db.select({ id: auditLog.id }).from(auditLog);
    expect(left.map((row) => row.id)).toEqual([kept]);
  });

  it("deletes expired sessions and verifications and keeps live ones", async () => {
    const now = new Date("2026-10-03T03:15:00.000Z");
    const user = await makeUser(db);
    await db.insert(session).values([
      {
        expiresAt: new Date(now.getTime() - 1),
        id: "gone",
        token: newId(),
        userId: user.id,
      },
      {
        expiresAt: new Date(now.getTime() + DAY_MS),
        id: "live",
        token: newId(),
        userId: user.id,
      },
    ]);
    await db.insert(verification).values([
      {
        expiresAt: new Date(now.getTime() - 1),
        id: "gone",
        identifier: "a",
        value: "b",
      },
      {
        expiresAt: new Date(now.getTime() + 60_000),
        id: "live",
        identifier: "a",
        value: "c",
      },
    ]);

    const first = await runRetentionPurge({ db, media, now });
    const second = await runRetentionPurge({ db, media, now });

    expect([first.session, first.verification]).toEqual([1, 1]);
    expect([second.session, second.verification]).toEqual([0, 0]);
    expect(await db.select({ id: session.id }).from(session)).toEqual([
      { id: "live" },
    ]);
    expect(await db.select({ id: verification.id }).from(verification)).toEqual(
      [{ id: "live" }]
    );
  });

  it("deletes an old orphan logo and keeps a fresh pending upload and a referenced one", async () => {
    const used = await seedCheckout(db, {
      count: 1,
      logo: true,
      paymentStatus: "paid",
      status: "live",
    });
    const usedKey = (await sponsorshipRow(db, used.sponsorshipIds[0] as string))
      .logoKey as string;
    const orphan = `logos/${newId()}`;
    await put(usedKey);
    await put(orphan);

    // Uploaded just now: a checkout may still come (24 h).
    const fresh = await runRetentionPurge({ db, media, now: new Date() });
    expect(fresh.logosDeleted).toBe(0);
    expect(await keys()).toEqual([orphan, usedKey].sort());

    const now = later();
    const first = await runRetentionPurge({ db, media, now });
    const second = await runRetentionPurge({ db, media, now });

    expect(first.logosDeleted).toBe(1);
    expect(second.logosDeleted).toBe(0);
    expect(await keys()).toEqual([usedKey]);
  });

  it("releases and deletes the logo of a sponsorship that ended more than 30 days ago", async () => {
    const now = later();
    const ended = await seedCheckout(db, {
      count: 1,
      logo: true,
      status: "expired",
    });
    const endedId = ended.sponsorshipIds[0] as string;
    const endedKey = (await sponsorshipRow(db, endedId)).logoKey as string;
    await setUpdated(
      endedId,
      new Date(now.getTime() - TERMINAL_LOGO_GRACE_MS - 1)
    );
    // Ended 30 days ago minus a millisecond: kept.
    const recent = await seedCheckout(db, {
      count: 1,
      logo: true,
      status: "rejected",
    });
    const recentId = recent.sponsorshipIds[0] as string;
    const recentKey = (await sponsorshipRow(db, recentId)).logoKey as string;
    await setUpdated(
      recentId,
      new Date(now.getTime() - TERMINAL_LOGO_GRACE_MS + 1)
    );
    await put(endedKey);
    await put(recentKey);

    const first = await runRetentionPurge({ db, media, now });
    const second = await runRetentionPurge({ db, media, now });

    expect(first).toMatchObject({ logosDeleted: 1, logosReleased: 1 });
    expect(second).toMatchObject({ logosDeleted: 0, logosReleased: 0 });
    const row = await sponsorshipRow(db, endedId);
    expect(row.logoKey).toBeNull();
    expect(row.status).toBe("expired");
    expect(row.updatedAt.getTime()).toBe(
      now.getTime() - TERMINAL_LOGO_GRACE_MS - 1
    );
    // The invoice data keeps that the logo was paid for.
    const [item] = await db
      .select()
      .from(paymentItem)
      .where(eq(paymentItem.sponsorshipId, endedId));
    expect(item?.includesLogo).toBe(true);
    expect((await sponsorshipRow(db, recentId)).logoKey).toBe(recentKey);
    expect(await keys()).toEqual([recentKey]);
  });

  it("keeps a logo one checkout shares with a sponsorship that is still running", async () => {
    const now = later();
    const seeded = await seedCheckout(db, {
      count: 2,
      logo: true,
      status: "live",
    });
    const [endedId, liveId] = seeded.sponsorshipIds as [string, string];
    const key = `logos/${newId()}`;
    await db
      .update(sponsorship)
      .set({ logoKey: key })
      .where(eq(sponsorship.sponsorId, seeded.sponsorId));
    await db
      .update(sponsorship)
      .set({ status: "cancelled" })
      .where(eq(sponsorship.id, endedId));
    await setUpdated(endedId, new Date(0));
    await put(key);

    const result = await runRetentionPurge({ db, media, now });

    expect(result).toMatchObject({ logosDeleted: 0, logosReleased: 0 });
    expect((await sponsorshipRow(db, endedId)).logoKey).toBe(key);
    expect((await sponsorshipRow(db, liveId)).logoKey).toBe(key);
    expect(await keys()).toEqual([key]);
  });

  it("follows the listing past one page", async () => {
    const now = later();
    const orphans = Array.from({ length: 1005 }, () => `logos/${newId()}`);
    for (let at = 0; at < orphans.length; at += 50) {
      // biome-ignore lint/performance/noAwaitInLoops: puts in small parallel groups.
      await Promise.all(orphans.slice(at, at + 50).map(put));
    }

    const result = await runRetentionPurge({ db, media, now });

    expect(result.logosDeleted).toBe(1005);
    expect(await keys()).toEqual([]);
  });

  it("counts in a dry run and deletes nothing", async () => {
    const now = later();
    await audit(new Date(now.getTime() - AUDIT_RETENTION_MS - 1));
    const ended = await seedCheckout(db, {
      count: 1,
      logo: true,
      status: "cancelled",
    });
    const endedId = ended.sponsorshipIds[0] as string;
    const endedKey = (await sponsorshipRow(db, endedId)).logoKey as string;
    await setUpdated(endedId, new Date(0));
    const orphan = `logos/${newId()}`;
    await put(endedKey);
    await put(orphan);

    const dry = await runRetentionPurge({ db, dryRun: true, media, now });

    expect(dry).toEqual({
      audit_log: 1,
      logosDeleted: 1,
      logosReleased: 1,
      session: 0,
      sponsorship_token: 0,
      verification: 0,
    });
    expect(await db.select().from(auditLog)).toHaveLength(1);
    expect((await sponsorshipRow(db, endedId)).logoKey).toBe(endedKey);
    expect(await keys()).toEqual([endedKey, orphan].sort());

    const real = await runRetentionPurge({ db, media, now });
    // The released logo becomes an orphan in the same run.
    expect(real).toMatchObject({
      audit_log: 1,
      logosDeleted: 2,
      logosReleased: 1,
    });
    expect(await keys()).toEqual([]);
  });

  it("skips the logo sweep without the MEDIA binding and still purges D1", async () => {
    const now = new Date("2026-10-03T03:15:00.000Z");
    await audit(new Date(now.getTime() - AUDIT_RETENTION_MS - 1));

    const result = await runRetentionPurge({ db, media: undefined, now });

    expect(result).toMatchObject({ audit_log: 1, logosDeleted: 0 });
  });
});
