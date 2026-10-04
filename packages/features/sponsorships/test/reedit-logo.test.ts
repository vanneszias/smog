/**
 * The kept logo of a re-edit (phase 7 task 9, task 8 review M-5):
 * `readReeditLogo` gives the holder of an open re-edit link their own
 * sponsorship's stored logo, so the preview shows what the render will.
 * The token is the only input (no key), so no other logo is reachable.
 */
import { env } from "cloudflare:workers";
import { sponsorship, sponsorshipToken } from "@smog/db";
import { DAY_MS, newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashSponsorshipToken } from "../src/schema";
import { requestChangesStatements } from "../src/server/lifecycle";
import { readReeditLogo } from "../src/server/reedit";
import { clearBucket } from "./clean";
import {
  makeAdmin,
  SITE_URL,
  seedCheckout,
  sponsorshipRow,
  testDb,
} from "./helpers";

const db = testDb();

function png(marker: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    0x0d,
    marker,
  ]);
}

/** A `changes_requested` sponsorship with an open link and a stored logo. */
async function changesRequested(
  options: { logo?: boolean; stored?: Uint8Array | null } = {}
) {
  const seeded = await seedCheckout(db, {
    count: 1,
    logo: options.logo ?? true,
    paymentStatus: "paid",
    status: "in_review",
    videoPlaybackId: "playback-1",
  });
  const id = seeded.sponsorshipIds[0] as string;
  const plan = await requestChangesStatements(db, {
    actorId: (await makeAdmin(db)).id,
    now: new Date(),
    siteUrl: SITE_URL,
    sponsorshipId: id,
  });
  await db.batch(plan.statements as never);
  const row = await sponsorshipRow(db, id);
  const stored = options.stored === undefined ? png(1) : options.stored;
  if (row?.logoKey && stored) {
    await env.MEDIA.put(row.logoKey, stored, {
      httpMetadata: { contentType: "image/png" },
    });
  }
  return { id, logoKey: row?.logoKey ?? null, token: plan.token };
}

function read(token: string, now = new Date()) {
  return readReeditLogo(db, env.MEDIA, { now, token });
}

beforeEach(async () => {
  await clearBucket(env.MEDIA);
});

describe("readReeditLogo", () => {
  it("gives the link holder their sponsorship's stored logo", async () => {
    const { token } = await changesRequested({ stored: png(7) });

    const logo = await read(token);

    expect(logo?.contentType).toBe("image/png");
    expect([...(logo?.bytes ?? [])]).toEqual([...png(7)]);
  });

  it("gives each token its own logo, never another sponsorship's", async () => {
    const a = await changesRequested({ stored: png(1) });
    const b = await changesRequested({ stored: png(2) });

    expect((await read(a.token))?.bytes.at(-1)).toBe(1);
    expect((await read(b.token))?.bytes.at(-1)).toBe(2);
  });

  it("is null for an unknown, a used, an expired or a renewal link", async () => {
    expect(await read("b".repeat(43))).toBeNull();

    const used = await changesRequested();
    await db
      .update(sponsorshipToken)
      .set({ usedAt: new Date() })
      .where(eq(sponsorshipToken.sponsorshipId, used.id));
    expect(await read(used.token)).toBeNull();

    const expired = await changesRequested();
    expect(
      await read(expired.token, new Date(Date.now() + 8 * DAY_MS))
    ).toBeNull();

    const renewal = await changesRequested();
    const raw = "c".repeat(43);
    await db.insert(sponsorshipToken).values({
      expiresAt: new Date(Date.now() + DAY_MS),
      id: newId(),
      purpose: "renewal",
      sponsorshipId: renewal.id,
      tokenHash: await hashSponsorshipToken(raw),
    });
    expect(await read(raw)).toBeNull();
  });

  it("is null once the sponsorship left changes_requested", async () => {
    const { id, token } = await changesRequested();
    await db
      .update(sponsorship)
      .set({ status: "rejected" })
      .where(eq(sponsorship.id, id));

    expect(await read(token)).toBeNull();
  });

  it("is null without a logo, without the object, or for bytes that are not an image", async () => {
    const none = await changesRequested({ logo: false });
    expect(await read(none.token)).toBeNull();

    const gone = await changesRequested({ stored: null });
    expect(await read(gone.token)).toBeNull();

    const html = await changesRequested({
      stored: new TextEncoder().encode("<html><script>1</script>"),
    });
    expect(await read(html.token)).toBeNull();
  });

  it("is null without the MEDIA binding", async () => {
    const { token } = await changesRequested();

    expect(
      await readReeditLogo(db, undefined, { now: new Date(), token })
    ).toBeNull();
  });
});
