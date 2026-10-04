import { sponsorshipToken, user } from "@smog/db";
import { makeGesture } from "@smog/db/testing";
import { createFakeMollie, type FakeMollie } from "@smog/payments/testing";
import { DAY_MS, newId } from "@smog/utils";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSponsorshipToken } from "../src/schema";
import {
  approveStatements,
  cancelPaymentStatements,
  forceExpireStatements,
  markPaidStatements,
  recordRefundStatements,
  regenerateTokenStatements,
  rejectStatements,
  requestChangesStatements,
  SponsorshipActionError,
} from "../src/server/lifecycle";
import { adminRecipients } from "../src/server/recipients";
import { readTokenLink } from "../src/server/token-link";
import { isStaleTransition } from "../src/server/transition";
import {
  eventsOf,
  makeAdmin,
  molliePaymentFor,
  NOW,
  paymentRow,
  refetch,
  SITE_URL,
  seedCheckout,
  seedRenewalPayment,
  sponsorshipRow,
  statusOf,
  testDb,
  trailsOf,
} from "./helpers";

const db = testDb();
let actorId: string;
let fake: FakeMollie;

beforeEach(async () => {
  actorId = (await makeAdmin(db)).id;
  fake = createFakeMollie();
});

async function one(
  options: Parameters<typeof seedCheckout>[1] = {}
): Promise<{ id: string; paymentId: string }> {
  const seeded = await seedCheckout(db, { count: 1, ...options });
  return {
    id: seeded.sponsorshipIds[0] as string,
    paymentId: seeded.paymentId,
  };
}

async function tokensOf(sponsorshipId: string) {
  return await db
    .select()
    .from(sponsorshipToken)
    .where(eq(sponsorshipToken.sponsorshipId, sponsorshipId));
}

describe("approve (ruling 14)", () => {
  it("goes live for 365 days from now and plans the live email with the stored dates", async () => {
    const { id } = await one({
      paymentStatus: "paid",
      status: "in_review",
      videoPlaybackId: "playback-1",
    });
    const plan = await approveStatements(db, {
      actorId,
      now: NOW,
      siteUrl: SITE_URL,
      sponsorshipId: id,
    });
    await db.batch(plan.statements as never);
    const row = await sponsorshipRow(db, id);
    expect(row.status).toBe("live");
    expect(row.startsAt?.getTime()).toBe(NOW.getTime());
    expect(row.endsAt?.getTime()).toBe(NOW.getTime() + 365 * DAY_MS);
    expect(plan.after).toEqual([
      {
        email: expect.objectContaining({
          idempotencyKey: `sponsorship_live:${id}:${NOW.getTime()}`,
          locale: "nl",
          props: expect.objectContaining({
            endsAt: new Date(NOW.getTime() + 365 * DAY_MS).toISOString(),
            startsAt: NOW.toISOString(),
          }),
          template: "transactional/sponsorship-live",
        }),
        kind: "email",
      },
    ]);
    const [event] = await eventsOf(db, id);
    expect(event).toMatchObject({ actorId, type: "approved" });
  });

  it("is refused without a video, and from another status", async () => {
    const noVideo = await one({ status: "in_review" });
    await expect(
      approveStatements(db, {
        actorId,
        now: NOW,
        siteUrl: SITE_URL,
        sponsorshipId: noVideo.id,
      })
    ).rejects.toMatchObject({ reason: "noVideo" });
    const rendering = await one({ status: "rendering", videoPlaybackId: "p" });
    await expect(
      approveStatements(db, {
        actorId,
        now: NOW,
        siteUrl: SITE_URL,
        sponsorshipId: rendering.id,
      })
    ).rejects.toBeInstanceOf(SponsorshipActionError);
    await expect(
      approveStatements(db, {
        actorId,
        now: NOW,
        siteUrl: SITE_URL,
        sponsorshipId: newId(),
      })
    ).rejects.toMatchObject({ reason: "notFound" });
  });

  it("a lost race is stale: the second batch changes nothing", async () => {
    const { id } = await one({ status: "in_review", videoPlaybackId: "p" });
    const approve = await approveStatements(db, {
      actorId,
      now: NOW,
      siteUrl: SITE_URL,
      sponsorshipId: id,
    });
    const reject = await rejectStatements(db, {
      actorId,
      now: NOW,
      reason: "No",
      sponsorshipId: id,
    });
    await db.batch(reject.statements as never);
    const error = await db
      .batch(approve.statements as never)
      .catch((e: unknown) => e);
    expect(isStaleTransition(error)).toBe(true);
    expect(await statusOf(db, id)).toBe("rejected");
  });
});

describe("reject and request changes", () => {
  it("rejects from in_review and changes_requested with the reason", async () => {
    for (const status of ["in_review", "changes_requested"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one fixture at a time.
      const { id } = await one({ status });
      const plan = await rejectStatements(db, {
        actorId,
        now: NOW,
        reason: " Blurry logo ",
        sponsorshipId: id,
      });
      await db.batch(plan.statements as never);
      expect(await statusOf(db, id)).toBe("rejected");
      expect((await eventsOf(db, id))[0]?.data).toEqual({
        reason: "Blurry logo",
      });
      expect(plan.after).toEqual([]);
    }
  });

  it("request changes issues a 7 day re-edit token, revokes the open one, and shows the raw token once", async () => {
    const { id } = await one({ status: "in_review" });
    const first = await requestChangesStatements(db, {
      actorId,
      now: NOW,
      siteUrl: SITE_URL,
      sponsorshipId: id,
    });
    await db.batch(first.statements as never);
    expect(await statusOf(db, id)).toBe("changes_requested");
    expect(first.url).toBe(
      `${SITE_URL}/sponsor/edit?token=${encodeURIComponent(first.token)}`
    );
    expect(first.expiresAt).toBe(NOW.getTime() + 7 * DAY_MS);
    const later = new Date(NOW.getTime() + 1000);
    const second = await regenerateTokenStatements(db, {
      actorId,
      now: later,
      purpose: "reedit",
      siteUrl: SITE_URL,
      sponsorshipId: id,
    });
    await db.batch(second.statements as never);
    const tokens = await tokensOf(id);
    expect(tokens).toHaveLength(2);
    const byHash = new Map(tokens.map((token) => [token.tokenHash, token]));
    const firstRow = byHash.get(await hashSponsorshipToken(first.token));
    const secondRow = byHash.get(await hashSponsorshipToken(second.token));
    expect(firstRow?.usedAt?.getTime()).toBe(later.getTime());
    expect(secondRow?.usedAt).toBeNull();
    // Never the raw token in a row.
    expect(tokens.some((token) => token.tokenHash === first.token)).toBe(false);
    expect((await eventsOf(db, id)).map((event) => event.type)).toEqual([
      "changes_requested",
      "token_issued",
      "token_issued",
    ]);
  });

  it("regenerates a renewal link only for an expiring sponsorship, expiring at ends_at", async () => {
    const endsAt = new Date(NOW.getTime() + 20 * DAY_MS);
    const { id } = await one({ endsAt, status: "expiring" });
    const plan = await regenerateTokenStatements(db, {
      actorId,
      now: NOW,
      purpose: "renewal",
      siteUrl: SITE_URL,
      sponsorshipId: id,
    });
    await db.batch(plan.statements as never);
    expect(plan.expiresAt).toBe(endsAt.getTime());
    expect(plan.url).toContain(`${SITE_URL}/sponsor/renew?token=`);
    const live = await one({ endsAt, status: "live" });
    await expect(
      regenerateTokenStatements(db, {
        actorId,
        now: NOW,
        purpose: "renewal",
        siteUrl: SITE_URL,
        sponsorshipId: live.id,
      })
    ).rejects.toMatchObject({ reason: "stale" });
  });
});

describe("fix round 1 (Minors 2, 5, 9)", () => {
  it("request changes from rejected refuses a gesture sponsored again meanwhile (gestureTaken)", async () => {
    const { id } = await one({ status: "rejected" });
    const row = await sponsorshipRow(db, id);
    const gesture = await db.query.gesture.findFirst({
      where: (table, { eq: equals }) => equals(table.id, row.gestureId),
    });
    await seedCheckout(db, { gestures: [gesture as never], status: "live" });
    await expect(
      requestChangesStatements(db, {
        actorId,
        now: NOW,
        siteUrl: SITE_URL,
        sponsorshipId: id,
      })
    ).rejects.toMatchObject({ reason: "gestureTaken" });
    expect(await statusOf(db, id)).toBe("rejected");
  });

  it("never issues a renewal link that is already expired", async () => {
    const { id } = await one({
      endsAt: new Date(NOW.getTime() - 1000),
      status: "expiring",
    });
    await expect(
      regenerateTokenStatements(db, {
        actorId,
        now: NOW,
        purpose: "renewal",
        siteUrl: SITE_URL,
        sponsorshipId: id,
      })
    ).rejects.toMatchObject({ reason: "notRenewable" });
  });

  it("the raw token appears only in the plan: not in the statements, the trail or the logs", async () => {
    const { id } = await one({ status: "in_review" });
    const logged: unknown[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      })
    );
    try {
      const plan = await requestChangesStatements(db, {
        actorId,
        now: NOW,
        siteUrl: SITE_URL,
        sponsorshipId: id,
      });
      const sqlText = JSON.stringify(
        (plan.statements as unknown as { toSQL: () => unknown }[]).map((s) =>
          s.toSQL()
        )
      );
      expect(sqlText).not.toContain(plan.token);
      await db.batch(plan.statements as never);
      const trail = JSON.stringify(await eventsOf(db, id));
      expect(trail).not.toContain(plan.token);
      expect(JSON.stringify(await tokensOf(id))).not.toContain(plan.token);
      expect(JSON.stringify(logged)).not.toContain(plan.token);
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });
});

describe("mark paid and cancel act on the whole payment", () => {
  it("mark paid moves every item to rendering and plans payment.settled", async () => {
    const seeded = await seedCheckout(db, { count: 3 });
    const plan = await markPaidStatements(db, {
      actorId,
      note: "Bank transfer 12/10",
      now: NOW,
      paymentId: seeded.paymentId,
    });
    await db.batch(plan.statements as never);
    expect(plan.sponsorshipIds.sort()).toEqual(
      [...seeded.sponsorshipIds].sort()
    );
    expect(plan.after).toEqual([
      {
        event: { paymentId: seeded.paymentId, type: "payment.settled" },
        kind: "event",
      },
    ]);
    const row = await paymentRow(db, seeded.paymentId);
    expect(row.status).toBe("paid");
    expect(row.paidAt?.getTime()).toBe(NOW.getTime());
    for (const trail of await trailsOf(db, seeded.sponsorshipIds)) {
      expect(trail.status).toBe("rendering");
      expect(trail.events[0]).toMatchObject({
        actorId,
        data: { note: "Bank transfer 12/10", paymentId: seeded.paymentId },
        type: "marked_paid_manually",
      });
    }
    // Twice: the payment is no longer open.
    await expect(
      markPaidStatements(db, { actorId, now: NOW, paymentId: seeded.paymentId })
    ).rejects.toMatchObject({ reason: "stale" });
  });

  it("mark paid on a renewal renews the sponsorship", async () => {
    const endsAt = new Date(NOW.getTime() + 5 * DAY_MS);
    const { id } = await one({
      endsAt,
      paymentStatus: "paid",
      status: "expiring",
    });
    const renewalId = await seedRenewalPayment(db, id);
    const plan = await markPaidStatements(db, {
      actorId,
      now: NOW,
      paymentId: renewalId,
    });
    await db.batch(plan.statements as never);
    const row = await sponsorshipRow(db, id);
    expect(row.status).toBe("live");
    expect(row.endsAt?.getTime()).toBe(endsAt.getTime() + 365 * DAY_MS);
    expect((await eventsOf(db, id))[0]?.data).toMatchObject({ manual: true });
  });

  it("cancel cancels an open payment and frees every gesture", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    const plan = await cancelPaymentStatements(db, {
      actorId,
      now: NOW,
      paymentId: seeded.paymentId,
    });
    await db.batch(plan.statements as never);
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("canceled");
    for (const trail of await trailsOf(db, seeded.sponsorshipIds)) {
      expect(trail.status).toBe("cancelled");
      expect(trail.events[0]?.data).toEqual({
        paymentId: seeded.paymentId,
        reason: "admin",
      });
    }
    await expect(
      cancelPaymentStatements(db, {
        actorId,
        now: NOW,
        paymentId: seeded.paymentId,
      })
    ).rejects.toMatchObject({ reason: "stale" });
  });

  it("a payment that changed between build and batch is stale and leaves nothing", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    const markPaid = await markPaidStatements(db, {
      actorId,
      now: NOW,
      paymentId: seeded.paymentId,
    });
    const cancel = await cancelPaymentStatements(db, {
      actorId,
      now: NOW,
      paymentId: seeded.paymentId,
    });
    await db.batch(cancel.statements as never);
    const error = await db
      .batch(markPaid.statements as never)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("canceled");
  });
});

describe("force expire and refunds", () => {
  it("force expires a live sponsorship and names the sponsored asset to delete", async () => {
    const gesture = await makeGesture(db, { muxAssetId: "gesture-asset" });
    const seeded = await seedCheckout(db, {
      endsAt: new Date(NOW.getTime() + DAY_MS),
      gestures: [gesture],
      status: "live",
      videoPlaybackId: "p",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const plan = await forceExpireStatements(db, {
      actorId,
      now: NOW,
      sponsorshipId: id,
    });
    await db.batch(plan.statements as never);
    expect(await statusOf(db, id)).toBe("expired");
    expect(plan.muxAssetId).toBeNull();
    expect((await eventsOf(db, id))[0]?.type).toBe("force_expired");
  });

  it("records Mollie's refund, and refuses when nothing was refunded", async () => {
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "refund_needed",
    });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    await expect(
      recordRefundStatements(db, {
        now: NOW,
        payment: await refetch(fake, mollieId),
        paymentId: seeded.paymentId,
      })
    ).rejects.toMatchObject({ reason: "notRefunded" });
    fake.refund(mollieId, 5000);
    // Another payment's Mollie view is refused (Minor 3).
    const other = await seedCheckout(db, { count: 1 });
    const otherMollie = await molliePaymentFor(db, fake, other.paymentId, 5000);
    fake.setStatus(otherMollie, "paid");
    fake.refund(otherMollie, 5000);
    await expect(
      recordRefundStatements(db, {
        now: NOW,
        payment: await refetch(fake, otherMollie),
        paymentId: seeded.paymentId,
      })
    ).rejects.toMatchObject({ reason: "stale" });
    const plan = await recordRefundStatements(db, {
      now: NOW,
      payment: await refetch(fake, mollieId),
      paymentId: seeded.paymentId,
    });
    expect(plan).toMatchObject({ amountCents: 5000, refundedCents: 5000 });
    await db.batch(plan.statements as never);
    const row = await paymentRow(db, seeded.paymentId);
    expect(row.refundedCents).toBe(5000);
    expect(row.refundedAt?.getTime()).toBe(NOW.getTime());
  });
});

describe("ending a sponsorship revokes its open links (phase 6 close-out)", () => {
  interface Raws {
    reedit: string;
    renewal: string;
  }

  /** An open re-edit and an open renewal link, as raw tokens. */
  async function openLinks(sponsorshipId: string): Promise<Raws> {
    const raws: Raws = {
      reedit: `reedit-${newId()}`,
      renewal: `renewal-${newId()}`,
    };
    for (const purpose of ["reedit", "renewal"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows.
      await db.insert(sponsorshipToken).values({
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
        id: newId(),
        purpose,
        sponsorshipId,
        tokenHash: await hashSponsorshipToken(raws[purpose]),
      });
    }
    return raws;
  }

  async function linkKinds(raws: Raws): Promise<string[]> {
    const kinds: string[] = [];
    for (const purpose of ["reedit", "renewal"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: two reads.
      const link = await readTokenLink(db, {
        now: NOW,
        purpose,
        raw: raws[purpose],
      });
      kinds.push(link.kind);
    }
    return kinds;
  }

  async function expectRevoked(sponsorshipId: string, raws: Raws) {
    const tokens = await tokensOf(sponsorshipId);
    expect(tokens).toHaveLength(2);
    for (const token of tokens) {
      expect(token.usedAt?.getTime()).toBe(NOW.getTime());
    }
    expect(await linkKinds(raws)).toEqual(["invalid", "invalid"]);
  }

  it("force expire revokes the open renewal and re-edit links in its batch", async () => {
    const seeded = await seedCheckout(db, {
      endsAt: new Date(NOW.getTime() + 10 * DAY_MS),
      status: "expiring",
      videoPlaybackId: "p",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const raws = await openLinks(id);
    const plan = await forceExpireStatements(db, {
      actorId,
      now: NOW,
      sponsorshipId: id,
    });
    await db.batch(plan.statements as never);
    expect(await statusOf(db, id)).toBe("expired");
    await expectRevoked(id, raws);
  });

  it("reject revokes the open links in its batch", async () => {
    const { id } = await one({ status: "changes_requested" });
    const raws = await openLinks(id);
    const plan = await rejectStatements(db, {
      actorId,
      now: NOW,
      reason: "No",
      sponsorshipId: id,
    });
    await db.batch(plan.statements as never);
    expect(await statusOf(db, id)).toBe("rejected");
    await expectRevoked(id, raws);
  });

  it("cancel revokes the open links of every cancelled sponsorship", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    const links: Raws[] = [];
    for (const id of seeded.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: one fixture at a time.
      links.push(await openLinks(id));
    }
    const plan = await cancelPaymentStatements(db, {
      actorId,
      now: NOW,
      paymentId: seeded.paymentId,
    });
    await db.batch(plan.statements as never);
    for (const [index, id] of seeded.sponsorshipIds.entries()) {
      // biome-ignore lint/performance/noAwaitInLoops: one fixture at a time.
      await expectRevoked(id, links[index] as Raws);
    }
  });

  it("a lost race revokes nothing", async () => {
    const { id } = await one({ status: "in_review" });
    const raws = await openLinks(id);
    const late = await rejectStatements(db, {
      actorId,
      now: NOW,
      reason: "Late",
      sponsorshipId: id,
    });
    const first = await rejectStatements(db, {
      actorId,
      now: NOW,
      reason: "First",
      sponsorshipId: id,
    });
    await db.batch(first.statements as never);
    // Reopen the links the winner revoked; the loser must not touch them.
    await db
      .update(sponsorshipToken)
      .set({ usedAt: null })
      .where(eq(sponsorshipToken.sponsorshipId, id));
    const error = await db
      .batch(late.statements as never)
      .catch((e: unknown) => e);
    expect(isStaleTransition(error)).toBe(true);
    expect(await linkKinds(raws)).toEqual(["open", "open"]);
  });
});

describe("adminRecipients (A-14)", () => {
  it("lists verified admins without a ban in force, in their locale (else nl)", async () => {
    const now = new Date();
    const plain = await makeAdmin(db, { locale: null });
    const unverified = await makeAdmin(db, { emailVerified: false });
    const banned = await makeAdmin(db, { banned: true });
    const banOver = await makeAdmin(db, {
      banExpires: new Date(now.getTime() - 1000),
      banned: true,
    });
    const recipients = await adminRecipients(db, now);
    const ids = recipients.map((r) => r.id);
    expect(ids).toContain(plain.id);
    expect(ids).toContain(banOver.id);
    expect(ids).not.toContain(unverified.id);
    expect(ids).not.toContain(banned.id);
    expect(recipients.find((r) => r.id === plain.id)?.locale).toBe("nl");
    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "user")));
    expect(ids.some((id) => users.some((u) => u.id === id))).toBe(false);
  });
});
