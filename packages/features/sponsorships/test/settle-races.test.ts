/**
 * `settlePayment` under real concurrency (fix round 1, Minor 10), and the
 * chargebacks of I-3. Each race runs its writers with `Promise.all` and
 * asserts one state, one trail and one notify set.
 */
import type { Gesture } from "@smog/db";
import { createFakeMollie, type FakeMollie } from "@smog/payments/testing";
import { DAY_MS } from "@smog/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { cancelPaymentStatements } from "../src/server/lifecycle";
import { settlePayment } from "../src/server/settle";
import { isStalePayment } from "../src/server/statements";
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
  testDb,
  trailsOf,
} from "./helpers";

const db = testDb();
let fake: FakeMollie;

beforeEach(() => {
  fake = createFakeMollie();
});

async function settleNow(mollieId: string) {
  return await settlePayment(db, {
    now: NOW,
    payment: await refetch(fake, mollieId),
  });
}

function keys(result: { notify: { idempotencyKey?: string }[] } | null) {
  return (result?.notify ?? []).map((email) => email.idempotencyKey).sort();
}

describe("settlePayment races", () => {
  it("paid ∥ paid: one paid payment, one payment_paid per item", async () => {
    const seeded = await seedCheckout(db, { count: 3 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 15_000);
    fake.setStatus(mollieId, "paid");
    const results = await Promise.all([
      settleNow(mollieId),
      settleNow(mollieId),
    ]);
    expect(results.map((r) => r?.outcome).sort()).toEqual(["already", "paid"]);
    for (const result of results) {
      expect(result?.events).toEqual([
        { paymentId: seeded.paymentId, type: "payment.settled" },
      ]);
    }
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("paid");
    for (const trail of await trailsOf(db, seeded.sponsorshipIds)) {
      expect(trail.status).toBe("rendering");
      expect(trail.events.map((event) => event.type)).toEqual(["payment_paid"]);
    }
  });

  it("paid ∥ an admin cancel: the money wins, once", async () => {
    const actor = await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    const cancel = await cancelPaymentStatements(db, {
      actorId: actor.id,
      now: NOW,
      paymentId: seeded.paymentId,
    });
    fake.setStatus(mollieId, "paid");
    const [settled, cancelled] = await Promise.allSettled([
      settleNow(mollieId),
      db.batch(cancel.statements as never),
    ]);
    expect(settled.status).toBe("fulfilled");
    if (cancelled.status === "rejected") {
      // The settle won: the cancel's payment guard stopped it.
      expect(isStalePayment(cancelled.reason)).toBe(true);
    }
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("paid");
    for (const trail of await trailsOf(db, seeded.sponsorshipIds)) {
      expect(trail.status).toBe("rendering");
      // Either payment_paid, or cancelled then revived: never both paths.
      expect([["payment_paid"], ["cancelled", "revived"]]).toContainEqual(
        trail.events.map((event) => event.type)
      );
    }
  });

  it("late ∥ late with one gesture taken: one refund_needed, one revival, one notify set", async () => {
    await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "expired");
    await settleNow(mollieId);
    await seedCheckout(db, { gestures: [seeded.gestures[0] as Gesture] });
    fake.setStatus(mollieId, "paid");
    const [a, b] = await Promise.all([
      settleNow(mollieId),
      settleNow(mollieId),
    ]);
    expect(a?.outcome).toBe("refund_needed");
    expect(b?.outcome).toBe("refund_needed");
    expect(keys(a)).toEqual(keys(b));
    expect(keys(a).length).toBeGreaterThan(0);
    expect(a?.events).toEqual(b?.events);
    const [blocked, freed] = await trailsOf(db, seeded.sponsorshipIds);
    expect(blocked?.status).toBe("cancelled");
    expect(blocked?.events.map((event) => event.type)).toEqual([
      "payment_failed",
      "refund_needed",
    ]);
    expect(freed?.status).toBe("rendering");
    expect(freed?.events.map((event) => event.type)).toEqual([
      "payment_failed",
      "revived",
    ]);
  });

  it("two renewal payments settling together add two years (Minor 1)", async () => {
    const endsAt = new Date(NOW.getTime() + 10 * DAY_MS);
    const seeded = await seedCheckout(db, {
      count: 1,
      endsAt,
      paymentStatus: "paid",
      status: "live",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const first = await seedRenewalPayment(db, id);
    const second = await seedRenewalPayment(db, id);
    const mollieA = await molliePaymentFor(db, fake, first, 5000, "renewal");
    const mollieB = await molliePaymentFor(db, fake, second, 5000, "renewal");
    fake.setStatus(mollieA, "paid");
    fake.setStatus(mollieB, "paid");
    await Promise.all([settleNow(mollieA), settleNow(mollieB)]);
    expect((await sponsorshipRow(db, id)).endsAt?.getTime()).toBe(
      endsAt.getTime() + 2 * 365 * DAY_MS
    );
    expect((await eventsOf(db, id)).map((event) => event.type)).toEqual([
      "renewed",
      "renewed",
    ]);
  });
});

describe("chargebacks (fix round 1, I-3)", () => {
  it("records a chargeback, notes it in the trail and emails the admins; the sponsorship is untouched", async () => {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 1 });
    const id = seeded.sponsorshipIds[0] as string;
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    await settleNow(mollieId);
    fake.chargeback(mollieId, 5000);
    const first = await settleNow(mollieId);
    const second = await settleNow(mollieId);

    expect(first?.outcome).toBe("already");
    expect(first?.notify).toContainEqual(
      expect.objectContaining({
        idempotencyKey: `admin_chargeback:${seeded.paymentId}:5000:${admin.id}`,
        props: expect.objectContaining({
          amountCents: 5000,
          paymentId: seeded.paymentId,
          reason: "chargeback",
        }),
        template: "transactional/admin-refund-needed",
        to: admin.email,
      })
    );
    // A retry re-derives the same keyed emails; the trail has one entry.
    expect(second).toEqual(first);
    const row = await paymentRow(db, seeded.paymentId);
    expect(row).toMatchObject({ chargedBackCents: 5000, status: "paid" });
    expect(row.chargedBackAt?.getTime()).toBe(NOW.getTime());
    expect((await eventsOf(db, id)).map((e) => [e.type, e.data])).toEqual([
      ["payment_paid", { paymentId: seeded.paymentId }],
      ["refund_needed", { paymentId: seeded.paymentId, reason: "chargeback" }],
    ]);
    expect((await sponsorshipRow(db, id)).status).toBe("rendering");
  });

  it("a second chargeback is recorded and emailed under a new key", async () => {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, { count: 2 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    await settleNow(mollieId);
    fake.chargeback(mollieId, 4000);
    await settleNow(mollieId);
    fake.chargeback(mollieId, 6000);
    const later = await settleNow(mollieId);
    expect(keys(later)).toContain(
      `admin_chargeback:${seeded.paymentId}:10000:${admin.id}`
    );
    expect((await paymentRow(db, seeded.paymentId)).chargedBackCents).toBe(
      10_000
    );
  });
});
