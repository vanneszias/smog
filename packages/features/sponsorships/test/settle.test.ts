import {
  type Gesture,
  payment,
  sponsor,
  sponsorship,
  sponsorshipToken,
} from "@smog/db";
import { makeGesture } from "@smog/db/testing";
import { createPayment } from "@smog/payments";
import { createFakeMollie, type FakeMollie } from "@smog/payments/testing";
import { DAY_MS, newId } from "@smog/utils";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settleFromMollie, settlePayment } from "../src/server/settle";
import {
  eventsOf,
  makeAdmin,
  molliePaymentFor,
  NOW,
  paymentRow,
  refetch,
  seedCheckout,
  seedRenewalPayment,
  sponsorshipRow,
  statusOf,
  testDb,
  trailsOf,
} from "./helpers";

const db = testDb();
let fake: FakeMollie;

beforeEach(() => {
  fake = createFakeMollie();
});

/** Settles what Mollie reports now, twice: the second run must change nothing. */
async function settleTwice(mollieId: string) {
  const first = await settlePayment(db, {
    now: NOW,
    payment: await refetch(fake, mollieId),
  });
  const second = await settlePayment(db, {
    now: NOW,
    payment: await refetch(fake, mollieId),
  });
  return { first, second };
}

async function eventTypes(sponsorshipId: string): Promise<string[]> {
  return (await eventsOf(db, sponsorshipId)).map((event) => event.type);
}

describe("settlePayment (ruling 6)", () => {
  it("paid: the payment is paid and every item goes to rendering, once", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    const { first, second } = await settleTwice(mollieId);

    expect(first).toMatchObject({
      events: [{ paymentId: seeded.paymentId, type: "payment.settled" }],
      kind: "initial",
      notify: [],
      outcome: "paid",
      paymentId: seeded.paymentId,
    });
    // Already paid: nothing written, but the fan-out is enqueued again.
    expect(second).toMatchObject({
      events: [{ paymentId: seeded.paymentId, type: "payment.settled" }],
      outcome: "already",
    });
    const row = await paymentRow(db, seeded.paymentId);
    expect(row.status).toBe("paid");
    expect(row.paidAt).not.toBeNull();
    for (const trail of await trailsOf(db, seeded.sponsorshipIds)) {
      expect(trail.status).toBe("rendering");
      expect(trail.events.map((event) => event.type)).toEqual(["payment_paid"]);
    }
  });

  it("re-checks Mollie by id (settleFromMollie) and ignores a payment that is not ours", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    const result = await settleFromMollie(db, fake.mollie, {
      mollieId,
      now: NOW,
    });
    expect(result?.outcome).toBe("paid");
    // Unknown at Mollie (404): nothing to do.
    expect(
      await settleFromMollie(db, fake.mollie, {
        mollieId: "tr_unknown123",
        now: NOW,
      })
    ).toBeNull();
    // Known at Mollie but not ours (another payment's metadata).
    const foreign = await molliePaymentFor(db, fake, newId(), 5000);
    expect(
      await settleFromMollie(db, fake.mollie, { mollieId: foreign, now: NOW })
    ).toBeNull();
  });

  it("finds a payment by its metadata when the Mollie id was never stored", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    await db
      .update(payment)
      .set({ mollieId: null })
      .where(eq(payment.id, seeded.paymentId));
    fake.setStatus(mollieId, "paid");
    const { first } = await settleTwice(mollieId);
    expect(first?.outcome).toBe("paid");
    expect((await paymentRow(db, seeded.paymentId)).mollieId).toBe(mollieId);
  });

  it("late paid after canceled, the gesture still free: revived to rendering, once", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "canceled");
    const failed = await settlePayment(db, {
      now: NOW,
      payment: await refetch(fake, mollieId),
    });
    expect(failed?.outcome).toBe("failed");
    fake.setStatus(mollieId, "paid");
    const { first, second } = await settleTwice(mollieId);

    expect(first).toMatchObject({
      events: [{ type: "payment.settled" }],
      notify: [],
      outcome: "late_revived",
    });
    expect(second?.outcome).toBe("already");
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("paid");
    for (const trail of await trailsOf(db, seeded.sponsorshipIds)) {
      expect(trail.status).toBe("rendering");
      expect(trail.events.map((event) => event.type)).toEqual([
        "payment_failed",
        "revived",
      ]);
    }
  });

  it("late paid with a gesture taken meanwhile: refund_needed, the admins told once each", async () => {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "expired");
    await settlePayment(db, {
      now: NOW,
      payment: await refetch(fake, mollieId),
    });
    // Someone else sponsors the first gesture while ours is cancelled.
    const taken = await seedCheckout(db, {
      gestures: [seeded.gestures[0] as Gesture],
    });
    fake.setStatus(mollieId, "paid");
    const { first, second } = await settleTwice(mollieId);

    expect(first?.outcome).toBe("refund_needed");
    expect(first?.notify).toContainEqual(
      expect.objectContaining({
        idempotencyKey: `admin_refund_needed:${seeded.paymentId}:${admin.id}`,
        locale: "fr",
        // Only the flagged item's share is refunded (Minor 4).
        props: expect.objectContaining({
          amountCents: 5000,
          paymentId: seeded.paymentId,
          reason: "late",
        }),
        template: "transactional/admin-refund-needed",
        to: admin.email,
      })
    );
    // The revived item still needs its render: the fan-out goes out.
    expect(first?.events).toEqual([
      { paymentId: seeded.paymentId, type: "payment.settled" },
    ]);
    // A retry (the first caller failed after the commit) re-derives the
    // same fan-out and the same keyed emails (fix round 1, I-1).
    expect(second).toEqual(first);
    expect((await paymentRow(db, seeded.paymentId)).status).toBe(
      "refund_needed"
    );
    const [blocked, freed] = seeded.sponsorshipIds as [string, string];
    expect(await statusOf(db, blocked)).toBe("cancelled");
    expect(await eventTypes(blocked)).toEqual([
      "payment_failed",
      "refund_needed",
    ]);
    expect(await statusOf(db, freed)).toBe("rendering");
    expect(await statusOf(db, taken.sponsorshipIds[0] as string)).toBe(
      "awaiting_payment"
    );
  });

  it("an amount mismatch: refund_needed, the items released, logged, once", async () => {
    await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    fake.corruptAmount(mollieId, "0.01");
    const tampered = await refetch(fake, mollieId);
    const first = await settlePayment(db, { now: NOW, payment: tampered });
    const second = await settlePayment(db, { now: NOW, payment: tampered });

    expect(first?.outcome).toBe("refund_needed");
    expect(first?.events).toEqual([]);
    expect(first?.notify[0]?.props).toMatchObject({
      amountCents: 1,
      reason: "mismatch",
    });
    expect(second).toEqual(first);
    expect((await paymentRow(db, seeded.paymentId)).status).toBe(
      "refund_needed"
    );
    const id = seeded.sponsorshipIds[0] as string;
    expect(await statusOf(db, id)).toBe("cancelled");
    expect(await eventTypes(id)).toEqual(["cancelled", "refund_needed"]);
  });

  it("a currency mismatch is a mismatch too", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    const fetched = await refetch(fake, mollieId);
    const result = await settlePayment(db, {
      now: NOW,
      payment: { ...fetched, currency: "USD" },
    });
    expect(result?.outcome).toBe("refund_needed");
  });

  it("paid after an admin marked it paid by hand: refund_needed (paid twice)", async () => {
    await makeAdmin(db);
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "paid",
      status: "rendering",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    // A fixture: the trail a manual mark-paid leaves (an insert).
    await db.run(
      sql`INSERT INTO sponsorship_event (id, sponsorship_id, type, actor_id, data, created_at) VALUES (${newId()}, ${id}, 'marked_paid_manually', NULL, ${JSON.stringify({ paymentId: seeded.paymentId })}, ${NOW.getTime()})`
    );
    fake.setStatus(mollieId, "paid");
    const { first, second } = await settleTwice(mollieId);
    expect(first?.outcome).toBe("refund_needed");
    expect(first?.notify[0]?.props).toMatchObject({
      amountCents: 5000,
      reason: "double",
    });
    // The sponsorship goes on: its fan-out is re-derived too.
    expect(first?.events).toEqual([
      { paymentId: seeded.paymentId, type: "payment.settled" },
    ]);
    expect(second).toEqual(first);
    expect(await statusOf(db, id)).toBe("rendering");
  });

  it("renewal paid: ends_at + 365 days, live, the reminder reset and the token used, once", async () => {
    const endsAt = new Date(NOW.getTime() + 10 * DAY_MS);
    const seeded = await seedCheckout(db, {
      count: 1,
      endsAt,
      paymentStatus: "paid",
      status: "expiring",
    });
    const id = seeded.sponsorshipIds[0] as string;
    await db
      .update(sponsorship)
      .set({ reminderSentAt: NOW })
      .where(eq(sponsorship.id, id));
    await db.insert(sponsorshipToken).values({
      expiresAt: endsAt,
      id: newId(),
      purpose: "renewal",
      sponsorshipId: id,
      tokenHash: `hash-${newId()}`,
    });
    const renewalId = await seedRenewalPayment(db, id);
    const mollieId = await molliePaymentFor(
      db,
      fake,
      renewalId,
      5000,
      "renewal"
    );
    fake.setStatus(mollieId, "paid");
    const { first, second } = await settleTwice(mollieId);

    expect(first).toMatchObject({ kind: "renewal", outcome: "paid" });
    expect(second?.outcome).toBe("already");
    const row = await sponsorshipRow(db, id);
    expect(row.status).toBe("live");
    expect(row.endsAt?.getTime()).toBe(endsAt.getTime() + 365 * DAY_MS);
    expect(row.reminderSentAt).toBeNull();
    expect(await eventTypes(id)).toEqual(["renewed"]);
    const tokens = await db
      .select()
      .from(sponsorshipToken)
      .where(eq(sponsorshipToken.sponsorshipId, id));
    expect(tokens.every((token) => token.usedAt !== null)).toBe(true);
    expect((await paymentRow(db, renewalId)).status).toBe("paid");
  });

  it("renewal paid after the sponsorship expired: refund_needed, not revived", async () => {
    await makeAdmin(db);
    const seeded = await seedCheckout(db, {
      count: 1,
      endsAt: new Date(NOW.getTime() - DAY_MS),
      paymentStatus: "paid",
      status: "expired",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const renewalId = await seedRenewalPayment(db, id);
    const mollieId = await molliePaymentFor(
      db,
      fake,
      renewalId,
      5000,
      "renewal"
    );
    fake.setStatus(mollieId, "paid");
    const { first, second } = await settleTwice(mollieId);
    expect(first?.outcome).toBe("refund_needed");
    expect(first?.notify[0]?.props).toMatchObject({
      amountCents: 5000,
      reason: "late",
    });
    expect(first?.events).toEqual([]);
    expect(second).toEqual(first);
    expect(await statusOf(db, id)).toBe("expired");
    expect((await paymentRow(db, renewalId)).status).toBe("refund_needed");
  });

  it("failed initial: the payment fails, the items are cancelled and the gesture is free, once", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "failed");
    const { first, second } = await settleTwice(mollieId);
    expect(first).toMatchObject({ events: [], notify: [], outcome: "failed" });
    expect(second?.outcome).toBe("noop");
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("failed");
    const id = seeded.sponsorshipIds[0] as string;
    expect(await statusOf(db, id)).toBe("cancelled");
    expect(await eventTypes(id)).toEqual(["payment_failed"]);
    // The gesture can be sponsored again (the partial unique index).
    await expect(
      seedCheckout(db, { gestures: [seeded.gestures[0] as Gesture] })
    ).resolves.toBeDefined();
  });

  it("failed renewal: only the payment changes; the sponsorship runs on", async () => {
    const seeded = await seedCheckout(db, {
      count: 1,
      endsAt: new Date(NOW.getTime() + 10 * DAY_MS),
      paymentStatus: "paid",
      status: "expiring",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const renewalId = await seedRenewalPayment(db, id);
    const mollieId = await molliePaymentFor(
      db,
      fake,
      renewalId,
      5000,
      "renewal"
    );
    fake.setStatus(mollieId, "canceled");
    const { first, second } = await settleTwice(mollieId);
    expect(first?.outcome).toBe("failed");
    expect(second?.outcome).toBe("noop");
    expect((await paymentRow(db, renewalId)).status).toBe("canceled");
    expect(await statusOf(db, id)).toBe("expiring");
    expect(await eventTypes(id)).toEqual([]);
  });

  it("out of order (canceled after paid) stays paid", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    await settleTwice(mollieId);
    fake.setStatus(mollieId, "canceled");
    const late = await settlePayment(db, {
      now: NOW,
      payment: await refetch(fake, mollieId),
    });
    expect(late?.outcome).toBe("noop");
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("paid");
  });

  it("open, pending and authorized change nothing", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    for (const status of ["open", "pending", "authorized"] as const) {
      fake.setStatus(mollieId, status);
      // biome-ignore lint/performance/noAwaitInLoops: one status after another.
      const result = await settlePayment(db, {
        now: NOW,
        payment: await refetch(fake, mollieId),
      });
      expect(result?.outcome).toBe("noop");
    }
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("open");
    expect(await statusOf(db, seeded.sponsorshipIds[0] as string)).toBe(
      "awaiting_payment"
    );
  });

  it("stores Mollie's refunded amount on every re-fetch, once", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    await settleTwice(mollieId);
    fake.refund(mollieId, 2000);
    const later = new Date(NOW.getTime() + 60_000);
    await settlePayment(db, {
      now: later,
      payment: await refetch(fake, mollieId),
    });
    await settlePayment(db, {
      now: new Date(later.getTime() + 60_000),
      payment: await refetch(fake, mollieId),
    });
    const row = await paymentRow(db, seeded.paymentId);
    expect(row.refundedCents).toBe(2000);
    expect(row.refundedAt?.getTime()).toBe(later.getTime());
    expect(row.status).toBe("paid");
  });

  it("a gesture made since does not change the result (published or not)", async () => {
    // Guard against a regression where availability, not the index, decided.
    const unpublished = await makeGesture(db, { publishedAt: null });
    const seeded = await seedCheckout(db, { gestures: [unpublished] });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    const { first } = await settleTwice(mollieId);
    expect(first?.outcome).toBe("paid");
  });
});

async function companyOf(sponsorId: string): Promise<string | null> {
  const row = await db.query.sponsor.findFirst({
    where: (table, { eq: equals }) => equals(table.id, sponsorId),
  });
  return row?.company ?? null;
}

describe("settlePayment's extra statements (the caller's, same batch)", () => {
  /** A marker the caller wants written with the settlement. */
  const marker = (id: string) =>
    db.update(sponsor).set({ company: id }).where(eq(sponsor.id, id));

  it("are written with the settlement, and alone when nothing else changes", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    const first = await settlePayment(db, {
      extra: [marker(seeded.sponsorId)],
      now: NOW,
      payment: await refetch(fake, mollieId),
    });
    expect(first?.outcome).toBe("paid");
    expect(await companyOf(seeded.sponsorId)).toBe(seeded.sponsorId);

    await db
      .update(sponsor)
      .set({ company: null })
      .where(eq(sponsor.id, seeded.sponsorId));
    const again = await settlePayment(db, {
      extra: [marker(seeded.sponsorId)],
      now: NOW,
      payment: await refetch(fake, mollieId),
    });
    expect(again?.outcome).toBe("already");
    expect(await companyOf(seeded.sponsorId)).toBe(seeded.sponsorId);
  });

  it("a failing extra statement leaves the settlement unwritten", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    await expect(
      settlePayment(db, {
        // A CHECK violation: the name must be 1..120 characters.
        extra: [
          db
            .update(sponsor)
            .set({ name: "" })
            .where(eq(sponsor.id, seeded.sponsorId)),
        ],
        now: NOW,
        payment: await refetch(fake, mollieId),
      })
    ).rejects.toThrow();
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("open");
    const statuses = await Promise.all(
      seeded.sponsorshipIds.map((id) => statusOf(db, id))
    );
    expect(statuses).toEqual(["awaiting_payment", "awaiting_payment"]);
  });
});

describe("Phase 6 fix wave (server): the admin refund and chargeback emails", () => {
  const at = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

  async function settleAt(mollieId: string, now: Date) {
    return await settlePayment(db, {
      now,
      payment: await refetch(fake, mollieId),
    });
  }

  /** A payment flagged refund_needed at NOW (paid twice: by hand, then Mollie). */
  async function flaggedDouble() {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "paid",
      status: "rendering",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    await db.run(
      sql`INSERT INTO sponsorship_event (id, sponsorship_id, type, actor_id, data, created_at) VALUES (${newId()}, ${id}, 'marked_paid_manually', NULL, ${JSON.stringify({ paymentId: seeded.paymentId })}, ${NOW.getTime() - DAY_MS})`
    );
    fake.setStatus(mollieId, "paid");
    const first = await settleAt(mollieId, NOW);
    expect(first?.outcome).toBe("refund_needed");
    expect(
      first?.notify.filter((email) => email.to === admin.email)
    ).toHaveLength(1);
    return { admin, mollieId, seeded };
  }

  function toAdmin(
    result: Awaited<ReturnType<typeof settleAt>>,
    admin: { email: string }
  ) {
    return result?.notify.filter((email) => email.to === admin.email) ?? [];
  }

  it("refund_needed: resent inside the 6-day window of the first flag, never after it", async () => {
    const { admin, mollieId } = await flaggedDouble();
    // A retry the next day still re-derives the email (the KV marker skips it).
    expect(toAdmin(await settleAt(mollieId, at(1)), admin)).toHaveLength(1);
    // Ten days later the KV marker is gone: nothing is told again.
    const late = await settleAt(mollieId, at(10));
    expect(late?.outcome).toBe("refund_needed");
    expect(late?.notify).toEqual([]);
  });

  it("refund_needed: nothing is told once Mollie's refund covers the amount", async () => {
    const { mollieId, seeded } = await flaggedDouble();
    fake.refund(mollieId, 5000);
    const refunded = await settleAt(mollieId, at(1));
    expect(refunded?.notify).toEqual([]);
    expect((await paymentRow(db, seeded.paymentId)).refundedCents).toBe(5000);
    // A partial refund leaves the rest to refund: still told in the window.
    const other = await flaggedDouble();
    fake.refund(other.mollieId, 2000);
    expect(
      toAdmin(await settleAt(other.mollieId, at(1)), other.admin)
    ).toHaveLength(1);
  });

  it("chargeback: told within 6 days of its recording, again only for a higher amount", async () => {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    await settleAt(mollieId, NOW);
    fake.chargeback(mollieId, 4000);
    const key = (cents: number) =>
      `admin_chargeback:${seeded.paymentId}:${cents}:${admin.id}`;
    const keys = (result: Awaited<ReturnType<typeof settleAt>>) =>
      toAdmin(result, admin).map((email) => email.idempotencyKey);

    expect(keys(await settleAt(mollieId, NOW))).toEqual([key(4000)]);
    expect(keys(await settleAt(mollieId, at(1)))).toEqual([key(4000)]);
    // A refund webhook ten days later tells nobody again.
    fake.refund(mollieId, 1000);
    expect(keys(await settleAt(mollieId, at(10)))).toEqual([]);
    // A new, higher chargeback is recorded and told.
    fake.chargeback(mollieId, 3000);
    expect(keys(await settleAt(mollieId, at(11)))).toEqual([key(7000)]);
    expect(
      (await paymentRow(db, seeded.paymentId)).chargedBackAt?.getTime()
    ).toBe(at(11).getTime());
    expect(keys(await settleAt(mollieId, at(20)))).toEqual([]);
  });

  it("a reversed chargeback stores Mollie's lower amount and tells nobody (M-7)", async () => {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    await settleAt(mollieId, NOW);
    fake.chargeback(mollieId, 5000);
    await settleAt(mollieId, NOW);
    const stored = fake.payments.get(mollieId);
    if (!stored) {
      throw new Error("[test] No fake payment");
    }
    stored.chargedBackCents = 0;
    const reversed = await settleAt(mollieId, at(1));
    expect(toAdmin(reversed, admin)).toEqual([]);
    const row = await paymentRow(db, seeded.paymentId);
    expect(row.chargedBackCents).toBe(0);
    expect(row.status).toBe("paid");
    // Idempotent: the next settle writes nothing new.
    expect(toAdmin(await settleAt(mollieId, at(1)), admin)).toEqual([]);
    expect((await paymentRow(db, seeded.paymentId)).chargedBackCents).toBe(0);
  });
});

describe("Phase 6 fix wave (server): settlePaid hardening", () => {
  it("an open payment Mollie reports paid but fully refunded is not activated (M-5)", async () => {
    await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 1 });
    const id = seeded.sponsorshipIds[0] as string;
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    fake.refund(mollieId, 5000);
    const { first, second } = await settleTwice(mollieId);
    expect(first?.outcome).toBe("refund_needed");
    expect(first?.events).toEqual([]);
    expect(second?.outcome).toBe("refund_needed");
    expect(await statusOf(db, id)).toBe("cancelled");
    expect((await paymentRow(db, seeded.paymentId)).status).toBe(
      "refund_needed"
    );
  });

  it("an open payment Mollie reports paid but charged back is not activated, and the admins are told (M-5)", async () => {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 1 });
    const id = seeded.sponsorshipIds[0] as string;
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    fake.chargeback(mollieId, 5000);
    const result = await settlePayment(db, {
      now: NOW,
      payment: await refetch(fake, mollieId),
    });
    expect(result?.outcome).toBe("refund_needed");
    expect(result?.notify.map((email) => email.idempotencyKey)).toContain(
      `admin_chargeback:${seeded.paymentId}:5000:${admin.id}`
    );
    expect(await statusOf(db, id)).toBe("cancelled");
  });

  it("a second Mollie payment of ours (another id) is logged and told when paid, never settled (M-6)", async () => {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 1 });
    await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    const other = await createPayment(fake.mollie, {
      amountCents: 5000,
      description: "Sponsoring",
      idempotencyKey: newId(),
      locale: "nl",
      metadata: { kind: "initial", paymentId: seeded.paymentId },
      redirectUrl: "https://smog.example/sponsor/success",
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const open = await settlePayment(db, {
      now: NOW,
      payment: await refetch(fake, other.id),
    });
    expect(open).toMatchObject({ notify: [], outcome: "duplicate" });

    fake.setStatus(other.id, "paid");
    const paid = await settlePayment(db, {
      now: NOW,
      payment: await refetch(fake, other.id),
    });
    expect(paid?.outcome).toBe("duplicate");
    expect(paid?.events).toEqual([]);
    expect(paid?.notify).toContainEqual(
      expect.objectContaining({
        idempotencyKey: `admin_refund_needed:${seeded.paymentId}:${other.id}:${admin.id}`,
        props: expect.objectContaining({ amountCents: 5000, reason: "double" }),
      })
    );
    expect(
      error.mock.calls.some(
        ([line]) =>
          String(line).includes(other.id) &&
          String(line).includes(seeded.paymentId)
      )
    ).toBe(true);
    // Ours is untouched.
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("open");
    expect(await statusOf(db, seeded.sponsorshipIds[0] as string)).toBe(
      "awaiting_payment"
    );
    error.mockRestore();
    warn.mockRestore();
  });
});
