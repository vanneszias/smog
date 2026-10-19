import { env } from "cloudflare:workers";
import { payment } from "@smog/db";
import { createFakeMollie, type FakeMollie } from "@smog/payments/testing";
import { newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recentFanout } from "../src/server/fanout-marker";
import {
  callAt,
  makeAdmin,
  molliePaymentFor,
  paymentRow,
  seedCheckout,
  seedRenewalPayment,
  statusOf,
  testDb,
} from "./helpers";

const db = testDb();
let fake: FakeMollie;

beforeEach(() => {
  fake = createFakeMollie();
});

/** A queue binding that records what it is sent. */
function recordingQueue() {
  const messages: unknown[] = [];
  return {
    messages,
    send: (body: unknown) => {
      messages.push(body);
      return Promise.resolve();
    },
  } as unknown as Queue & { messages: unknown[] };
}

interface StatusAnswer {
  displayName: string;
  endsAt?: number;
  items: { gestureName: string; gestureSlug: string; includesLogo: boolean }[];
  kind: string;
  renewedUntil?: number;
  status: string;
  totalCents: number;
}

function paymentStatus(
  ref: string,
  queues = { email: recordingQueue(), events: recordingQueue() }
): Promise<StatusAnswer> {
  return callAt<StatusAnswer>(
    "paymentStatus",
    { payment: ref },
    { env: { EMAIL_QUEUE: queues.email, EVENTS_QUEUE: queues.events } },
    { mollieFetch: fake.fetch }
  );
}

async function forgetThrottle(paymentId: string): Promise<void> {
  await env.KV.delete(`sponsorships:status-refetch:${paymentId}`);
}

describe("sponsorships.paymentStatus (S-14, ruling 2)", () => {
  it("answers by our id or Mollie's, with no PII (the keys are fixed)", async () => {
    const seeded = await seedCheckout(db, { logo: true });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 12_000);
    const byOurs = await paymentStatus(seeded.paymentId);
    await forgetThrottle(seeded.paymentId);
    const byMollie = await paymentStatus(mollieId);
    expect(byMollie).toEqual(byOurs);
    expect(Object.keys(byOurs).sort()).toEqual([
      "displayName",
      "items",
      "kind",
      "status",
      "totalCents",
    ]);
    expect(byOurs.items.map((item) => Object.keys(item).sort())).toEqual([
      ["gestureName", "gestureSlug", "includesLogo"],
      ["gestureName", "gestureSlug", "includesLogo"],
    ]);
    expect(byOurs).toMatchObject({
      displayName: "Acme BV",
      kind: "initial",
      status: "open",
      totalCents: 12_000,
    });
    expect(byOurs.items.map((i) => i.gestureName).sort()).toEqual(
      [seeded.gestures[0]?.name, seeded.gestures[1]?.name].sort()
    );
    expect(byOurs.items.every((i) => i.includesLogo)).toBe(true);
    const json = JSON.stringify(byOurs);
    expect(json).not.toContain("@example.com");
    expect(json).not.toContain("Alex Sponsor");
    expect(json).not.toContain(mollieId);
    expect(json).not.toContain("checkout");
  });

  it("settles an open payment Mollie reports paid, without a webhook, and enqueues the fan-out", async () => {
    await makeAdmin(db);
    const seeded = await seedCheckout(db);
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    const queues = { email: recordingQueue(), events: recordingQueue() };
    const answer = await paymentStatus(seeded.paymentId, queues);
    expect(answer.status).toBe("paid");
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("paid");
    for (const id of seeded.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: one status per row.
      expect(await statusOf(db, id)).toBe("rendering");
    }
    expect(queues.events.messages).toEqual([
      { paymentId: seeded.paymentId, type: "payment.settled" },
    ]);
  });

  it("marks the fan-out it enqueued, so the webhook's `already` that follows sends no second one (fix wave, payments M-2)", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    expect(await recentFanout(env.KV, seeded.paymentId)).toBe(false);
    await paymentStatus(seeded.paymentId);
    expect(await recentFanout(env.KV, seeded.paymentId)).toBe(true);
    // A failed enqueue leaves no marker: the webhook then sends it.
    const other = await seedCheckout(db, { count: 1 });
    const otherMollie = await molliePaymentFor(db, fake, other.paymentId, 5000);
    fake.setStatus(otherMollie, "paid");
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await paymentStatus(other.paymentId, {
      email: recordingQueue(),
      events: undefined as unknown as ReturnType<typeof recordingQueue>,
    });
    expect(await recentFanout(env.KV, other.paymentId)).toBe(false);
    error.mockRestore();
  });

  it("re-fetches an open payment at most once per 5 s", async () => {
    const seeded = await seedCheckout(db);
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    const before = fake.requests.length;
    await paymentStatus(seeded.paymentId);
    await paymentStatus(seeded.paymentId);
    await paymentStatus(mollieId);
    const gets = fake.requests
      .slice(before)
      .filter((request) => request.method === "GET");
    expect(gets).toHaveLength(1);
  });

  it("answers the stored status when Mollie is down", async () => {
    const seeded = await seedCheckout(db);
    await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.failNext(503);
    expect((await paymentStatus(seeded.paymentId)).status).toBe("open");
  });

  it("does not re-fetch a payment that is no longer open", async () => {
    const seeded = await seedCheckout(db, { paymentStatus: "canceled" });
    await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    const before = fake.requests.length;
    expect((await paymentStatus(seeded.paymentId)).status).toBe("canceled");
    expect(fake.requests.length).toBe(before);
  });

  it("answers renewedUntil for a paid renewal", async () => {
    const endsAt = new Date("2027-10-03T10:00:00.000Z");
    const seeded = await seedCheckout(db, { count: 1, endsAt, status: "live" });
    const renewalId = await seedRenewalPayment(
      db,
      seeded.sponsorshipIds[0] as string,
      { status: "paid" }
    );
    const answer = await paymentStatus(renewalId);
    expect(answer).toMatchObject({
      kind: "renewal",
      renewedUntil: endsAt.getTime(),
      status: "paid",
      totalCents: 5000,
    });
  });

  it("answers the current end for a renewal that did not go through", async () => {
    const endsAt = new Date("2026-11-03T10:00:00.000Z");
    for (const status of ["failed", "canceled", "expired"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one fixture at a time.
      const seeded = await seedCheckout(db, {
        count: 1,
        endsAt,
        status: "expiring",
      });
      const renewalId = await seedRenewalPayment(
        db,
        seeded.sponsorshipIds[0] as string,
        { status }
      );
      const answer = await paymentStatus(renewalId);
      expect(answer).toMatchObject({
        endsAt: endsAt.getTime(),
        kind: "renewal",
        status,
      });
      expect(answer.renewedUntil).toBeUndefined();
    }
  });

  it("sends no end for an initial payment, nor renewedUntil for a failed renewal", async () => {
    const endsAt = new Date("2027-10-03T10:00:00.000Z");
    const initial = await seedCheckout(db, {
      endsAt,
      paymentStatus: "failed",
    });
    const answer = await paymentStatus(initial.paymentId);
    expect(answer.endsAt).toBeUndefined();
    expect(answer.renewedUntil).toBeUndefined();
    const live = await seedCheckout(db, { count: 1, endsAt, status: "live" });
    const paid = await seedRenewalPayment(
      db,
      live.sponsorshipIds[0] as string,
      { status: "paid" }
    );
    expect((await paymentStatus(paid)).endsAt).toBeUndefined();
  });

  it("answers NOT_FOUND for an unknown payment", async () => {
    await expect(paymentStatus(newId())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(paymentStatus("tr_unknown123")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("never returns a payment's checkout or Mollie fields", async () => {
    const seeded = await seedCheckout(db);
    await db
      .update(payment)
      .set({ checkoutUrl: "https://pay.example/secret" })
      .where(eq(payment.id, seeded.paymentId));
    expect(JSON.stringify(await paymentStatus(seeded.paymentId))).not.toContain(
      "pay.example"
    );
  });
});
