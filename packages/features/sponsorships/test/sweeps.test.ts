/**
 * The lifecycle crons (ruling 9): expiry (J-01), the renewal reminder
 * (J-02) and the stale payments (J-03). Each sweep runs twice and must
 * produce one effect: one transition, one email, one token, one deletion.
 */
import {
  payment,
  sponsorship,
  sponsorshipEvent,
  sponsorshipToken,
} from "@smog/db";
import { makeGesture } from "@smog/db/testing";
import type { OutboxEmail } from "@smog/email";
import type { EventMessage, QueueProducer } from "@smog/jobs";
import { createFakeMollie, type FakeMollie } from "@smog/payments/testing";
import { DAY_MS } from "@smog/utils";
import { createFakeMux, type FakeMux } from "@smog/video/testing";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSponsorshipToken } from "../src/schema";
import { createRenderJob } from "../src/server/render";
import {
  RECONCILE_GRACE_MS,
  RECONCILE_MAX_PAYMENTS,
  REMINDER_WINDOW_MS,
  runExpirySweep,
  runReminderSweep,
  runStaleSweep,
  STALE_PAYMENT_AGE_MS,
} from "../src/server/sweeps";
import { clearSponsorships } from "./clean";
import {
  eventsOf,
  makeAdmin,
  molliePaymentFor,
  NOW,
  paymentRow,
  SITE_URL,
  seedCheckout,
  seedRenewalPayment,
  sponsorshipRow,
  testDb,
} from "./helpers";

const db = testDb();

/** An outbox that records what it was handed. */
function recordingOutbox() {
  const sent: OutboxEmail[] = [];
  return {
    outbox: {
      send: (email: OutboxEmail) => {
        sent.push(email);
        return Promise.resolve();
      },
    },
    sent,
  };
}

/** A queue producer that records the messages. */
function recordingQueue() {
  const messages: EventMessage[] = [];
  const queue: QueueProducer<EventMessage> = {
    send: (body) => {
      messages.push(body);
      return Promise.resolve();
    },
  };
  return { messages, queue };
}

async function one(options: Parameters<typeof seedCheckout>[1] = {}) {
  const seeded = await seedCheckout(db, { count: 1, ...options });
  return {
    gesture: seeded.gestures[0],
    id: seeded.sponsorshipIds[0] as string,
    paymentId: seeded.paymentId,
  };
}

async function setAsset(id: string, assetId: string | null): Promise<void> {
  await db
    .update(sponsorship)
    .set({ videoAssetId: assetId })
    .where(eq(sponsorship.id, id));
}

beforeEach(async () => {
  await clearSponsorships(db);
});

describe("runExpirySweep (J-01)", () => {
  let mux: FakeMux;

  beforeEach(() => {
    mux = createFakeMux();
  });

  it("expires live and expiring sponsorships past their end, deletes the sponsored asset once", async () => {
    const asset = mux.addAsset();
    const live = await one({
      endsAt: new Date(NOW.getTime() - 1),
      paymentStatus: "paid",
      status: "live",
    });
    await setAsset(live.id, asset.id);
    const expiring = await one({
      endsAt: new Date(NOW.getTime() - DAY_MS),
      paymentStatus: "paid",
      status: "expiring",
    });
    const running = await one({
      endsAt: new Date(NOW.getTime() + 1),
      paymentStatus: "paid",
      status: "live",
    });
    // Exactly at the end: not yet past it.
    const atEnd = await one({
      endsAt: NOW,
      paymentStatus: "paid",
      status: "live",
    });

    const first = await runExpirySweep({ db, mux: mux.mux, now: NOW });
    const second = await runExpirySweep({ db, mux: mux.mux, now: NOW });

    expect(first).toEqual({
      assetsDeleted: 1,
      assetsFailed: 0,
      assetsSkipped: 0,
      expired: 2,
      failed: 0,
    });
    expect(second).toEqual({
      assetsDeleted: 0,
      assetsFailed: 0,
      assetsSkipped: 0,
      expired: 0,
      failed: 0,
    });
    expect((await sponsorshipRow(db, live.id)).status).toBe("expired");
    expect((await sponsorshipRow(db, expiring.id)).status).toBe("expired");
    expect((await sponsorshipRow(db, running.id)).status).toBe("live");
    expect((await sponsorshipRow(db, atEnd.id)).status).toBe("live");
    expect(mux.assets.has(asset.id)).toBe(false);
    expect(
      mux.requests.filter((request) => request.method === "DELETE")
    ).toHaveLength(1);
    const trail = await eventsOf(db, live.id);
    expect(trail.filter((event) => event.type === "expired")).toHaveLength(1);
  });

  it("never deletes the gesture's own asset (the fake render)", async () => {
    const own = mux.addAsset();
    const gesture = await makeGesture(db, { muxAssetId: own.id });
    const seeded = await seedCheckout(db, {
      endsAt: new Date(NOW.getTime() - 1),
      gestures: [gesture],
      paymentStatus: "paid",
      status: "live",
    });
    const id = seeded.sponsorshipIds[0] as string;
    await setAsset(id, own.id);

    const result = await runExpirySweep({ db, mux: mux.mux, now: NOW });

    expect(result.expired).toBe(1);
    expect(result.assetsDeleted).toBe(0);
    expect(mux.assets.has(own.id)).toBe(true);
    expect(mux.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("never deletes an asset another gesture or a running sponsorship still uses", async () => {
    const shared = mux.addAsset();
    await makeGesture(db, { muxAssetId: shared.id });
    const ended = await one({
      endsAt: new Date(NOW.getTime() - 1),
      paymentStatus: "paid",
      status: "live",
    });
    await setAsset(ended.id, shared.id);
    const other = mux.addAsset();
    const a = await one({
      endsAt: new Date(NOW.getTime() - 1),
      paymentStatus: "paid",
      status: "live",
    });
    const b = await one({
      endsAt: new Date(NOW.getTime() + DAY_MS),
      paymentStatus: "paid",
      status: "live",
    });
    await setAsset(a.id, other.id);
    await setAsset(b.id, other.id);

    const result = await runExpirySweep({ db, mux: mux.mux, now: NOW });

    expect(result.expired).toBe(2);
    expect(result.assetsDeleted).toBe(0);
    expect(mux.assets.has(shared.id)).toBe(true);
    expect(mux.assets.has(other.id)).toBe(true);
  });

  it("logs and swallows a Mux failure: the sponsorship still expires, no retry", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const asset = mux.addAsset();
    const ended = await one({
      endsAt: new Date(NOW.getTime() - 1),
      paymentStatus: "paid",
      status: "live",
    });
    await setAsset(ended.id, asset.id);
    mux.failNext(500);

    const first = await runExpirySweep({ db, mux: mux.mux, now: NOW });
    const second = await runExpirySweep({ db, mux: mux.mux, now: NOW });

    expect(first).toMatchObject({
      assetsDeleted: 0,
      assetsFailed: 1,
      expired: 1,
    });
    expect(second).toMatchObject({ assetsFailed: 0, expired: 0 });
    expect((await sponsorshipRow(db, ended.id)).status).toBe("expired");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        `[sponsorships] Failed to delete the Mux asset ${asset.id}`
      ),
      expect.anything()
    );
    error.mockRestore();
  });

  it("expires without Mux credentials and leaves the asset (logged)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ended = await one({
      endsAt: new Date(NOW.getTime() - 1),
      paymentStatus: "paid",
      status: "live",
    });
    await setAsset(ended.id, "asset-without-mux");

    const result = await runExpirySweep({ db, mux: null, now: NOW });

    expect(result).toMatchObject({ assetsSkipped: 1, expired: 1 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves every other status alone", async () => {
    const past = new Date(NOW.getTime() - DAY_MS);
    const ids = await Promise.all(
      (
        [
          "awaiting_payment",
          "rendering",
          "render_failed",
          "in_review",
          "changes_requested",
          "rejected",
          "cancelled",
        ] as const
      ).map(async (status) => (await one({ endsAt: past, status })).id)
    );

    const result = await runExpirySweep({ db, mux: mux.mux, now: NOW });

    expect(result.expired).toBe(0);
    const events = await db.select().from(sponsorshipEvent);
    expect(events).toHaveLength(0);
    expect(ids).toHaveLength(7);
  });
});

describe("runReminderSweep (J-02)", () => {
  it("sends exactly one reminder with one renewal token per sponsorship, run twice", async () => {
    const endsAt = new Date(NOW.getTime() + 10 * DAY_MS);
    const { id } = await one({ endsAt, paymentStatus: "paid", status: "live" });
    const { outbox, sent } = recordingOutbox();

    const first = await runReminderSweep({
      db,
      email: outbox,
      now: NOW,
      siteUrl: SITE_URL,
    });
    const second = await runReminderSweep({
      db,
      email: outbox,
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(first).toEqual({ emailFailed: 0, failed: 0, reminded: 1 });
    expect(second).toEqual({ emailFailed: 0, failed: 0, reminded: 0 });
    const row = await sponsorshipRow(db, id);
    expect(row.status).toBe("expiring");
    expect(row.reminderSentAt?.getTime()).toBe(NOW.getTime());
    const tokens = await db
      .select()
      .from(sponsorshipToken)
      .where(eq(sponsorshipToken.sponsorshipId, id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ purpose: "renewal", usedAt: null });
    expect(tokens[0]?.expiresAt.getTime()).toBe(endsAt.getTime());

    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email).toMatchObject({
      idempotencyKey: `renewal_reminder:${id}:${endsAt.getTime()}`,
      locale: "nl",
      props: {
        endsAt: endsAt.toISOString(),
        name: "Alex Sponsor",
      },
      template: "transactional/renewal-reminder",
      to: `${row.sponsorId}@example.com`,
    });
    // The link's raw token hashes to the stored one; it is stored nowhere.
    const url = new URL(
      (email?.props as { url: string } | undefined)?.url ?? ""
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${SITE_URL}/sponsor/renew`);
    const raw = url.searchParams.get("token") ?? "";
    expect(await hashSponsorshipToken(raw)).toBe(tokens[0]?.tokenHash);
    const trail = (await eventsOf(db, id)).map((event) => event.type);
    expect(trail).toEqual(["token_issued", "reminder_sent"]);
    expect(JSON.stringify(await eventsOf(db, id))).not.toContain(raw);
  });

  it("reminds at exactly 30 days and not a millisecond later", async () => {
    const edge = await one({
      endsAt: new Date(NOW.getTime() + REMINDER_WINDOW_MS),
      paymentStatus: "paid",
      status: "live",
    });
    const beyond = await one({
      endsAt: new Date(NOW.getTime() + REMINDER_WINDOW_MS + 1),
      paymentStatus: "paid",
      status: "live",
    });
    // Ended already (the expiry sweep's): never reminded.
    const ended = await one({
      endsAt: NOW,
      paymentStatus: "paid",
      status: "live",
    });
    const { outbox, sent } = recordingOutbox();

    const result = await runReminderSweep({
      db,
      email: outbox,
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(REMINDER_WINDOW_MS).toBe(30 * DAY_MS);
    expect(result.reminded).toBe(1);
    expect(sent.map((email) => email.idempotencyKey)).toEqual([
      `renewal_reminder:${edge.id}:${NOW.getTime() + REMINDER_WINDOW_MS}`,
    ]);
    expect((await sponsorshipRow(db, beyond.id)).status).toBe("live");
    expect((await sponsorshipRow(db, ended.id)).status).toBe("live");
  });

  it("emails nobody else: not reminded twice, no other status, no row without an end", async () => {
    const soon = new Date(NOW.getTime() + DAY_MS);
    // Already reminded (a renewal resets reminder_sent_at).
    const reminded = await one({ endsAt: soon, status: "live" });
    await db
      .update(sponsorship)
      .set({ reminderSentAt: NOW })
      .where(eq(sponsorship.id, reminded.id));
    await one({ endsAt: soon, status: "expiring" });
    await one({ endsAt: soon, status: "in_review" });
    await one({ endsAt: soon, status: "changes_requested" });
    await one({ endsAt: soon, status: "rejected" });
    await one({ endsAt: soon, status: "cancelled" });
    await one({ endsAt: soon, status: "expired" });
    await one({ endsAt: null, status: "live" });
    const { outbox, sent } = recordingOutbox();

    const result = await runReminderSweep({
      db,
      email: outbox,
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(result.reminded).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await db.select().from(sponsorshipToken)).toHaveLength(0);
  });

  it("keeps the reminder when the queue is down (logged): no second email next run", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { id } = await one({
      endsAt: new Date(NOW.getTime() + DAY_MS),
      status: "live",
    });
    const failing = {
      send: () => Promise.reject(new Error("queue down")),
    };

    const result = await runReminderSweep({
      db,
      email: failing,
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(result).toEqual({ emailFailed: 1, failed: 0, reminded: 1 });
    expect((await sponsorshipRow(db, id)).status).toBe("expiring");
    expect(error).toHaveBeenCalledWith(
      `[sponsorships] Failed to queue the renewal reminder for ${id}:`,
      expect.any(Error)
    );
    error.mockRestore();
  });
});

describe("runStaleSweep (J-03)", () => {
  let fake: FakeMollie;
  const old = new Date(NOW.getTime() - STALE_PAYMENT_AGE_MS - 1);

  beforeEach(() => {
    fake = createFakeMollie();
  });

  async function staleCheckout(
    options: Parameters<typeof seedCheckout>[1] = {}
  ) {
    const seeded = await seedCheckout(db, { count: 2, ...options });
    await db
      .update(payment)
      .set({ createdAt: old })
      .where(eq(payment.id, seeded.paymentId));
    return seeded;
  }

  it("settles a payment Mollie reports paid, never cancels it", async () => {
    const seeded = await staleCheckout();
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    const { messages, queue } = recordingQueue();
    const { outbox } = recordingOutbox();

    const first = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });
    const second = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });

    expect(first).toMatchObject({ cancelled: 0, settled: 1 });
    expect(second).toMatchObject({ cancelled: 0, settled: 0 });
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("paid");
    for (const id of seeded.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows, in order.
      expect((await sponsorshipRow(db, id)).status).toBe("rendering");
    }
    // The settle's fan-out; the second run may re-send it (the
    // reconciliation: no consumer creates the render jobs here).
    expect(messages[0]).toEqual({
      paymentId: seeded.paymentId,
      type: "payment.settled",
    });
    expect(
      messages.every(
        (m) => m.type === "payment.settled" && m.paymentId === seeded.paymentId
      )
    ).toBe(true);
    expect(fake.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("cancels a cancelable payment in Mollie and frees the gestures", async () => {
    const seeded = await staleCheckout();
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    const { messages, queue } = recordingQueue();
    const { outbox } = recordingOutbox();

    const first = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });
    const second = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });

    expect(first).toMatchObject({ cancelled: 1, cancelledAtMollie: 1 });
    expect(second).toMatchObject({ cancelled: 0, cancelledAtMollie: 0 });
    expect(fake.payments.get(mollieId)?.status).toBe("canceled");
    expect(
      fake.requests.filter((r) => r.method === "DELETE").map((r) => r.path)
    ).toEqual([`/v2/payments/${mollieId}`]);
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("canceled");
    for (const id of seeded.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows, in order.
      const trail = await eventsOf(db, id);
      expect((await sponsorshipRow(db, id)).status).toBe("cancelled");
      expect(trail.filter((e) => e.type !== "created")).toHaveLength(1);
    }
    expect(messages).toEqual([]);
  });

  it("cancels locally without a Mollie key, and without a Mollie id", async () => {
    const noKey = await staleCheckout({ mollieId: "tr_noKeyPayment1" });
    const { outbox } = recordingOutbox();
    const { queue } = recordingQueue();

    const result = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: null,
      now: NOW,
    });

    expect(result).toMatchObject({ cancelled: 1, cancelledAtMollie: 0 });
    expect((await paymentRow(db, noKey.paymentId)).status).toBe("canceled");
    for (const id of noKey.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows, in order.
      const trail = await eventsOf(db, id);
      expect((await sponsorshipRow(db, id)).status).toBe("cancelled");
      expect(trail.at(-1)).toMatchObject({
        data: { paymentId: noKey.paymentId, reason: "stale" },
        type: "cancelled",
      });
    }

    // A crash between the checkout batch and Mollie: no `mollie_id`.
    const noId = await staleCheckout();
    const again = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });
    expect(again).toMatchObject({ cancelled: 1, cancelledAtMollie: 0 });
    expect((await paymentRow(db, noId.paymentId)).status).toBe("canceled");
    expect(fake.requests).toHaveLength(0);
  });

  it("cancels only the payment of a renewal: the sponsorship runs to its end", async () => {
    const { id } = await one({
      endsAt: new Date(NOW.getTime() + DAY_MS),
      paymentStatus: "paid",
      status: "expiring",
    });
    const paymentId = await seedRenewalPayment(db, id);
    await db
      .update(payment)
      .set({ createdAt: old })
      .where(eq(payment.id, paymentId));
    const { outbox } = recordingOutbox();
    const { queue } = recordingQueue();

    const first = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: null,
      now: NOW,
    });
    const second = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: null,
      now: NOW,
    });

    expect(first.cancelled).toBe(1);
    expect(second.cancelled).toBe(0);
    expect((await paymentRow(db, paymentId)).status).toBe("canceled");
    expect((await sponsorshipRow(db, id)).status).toBe("expiring");
    expect(await eventsOf(db, id)).toHaveLength(0);
  });

  it("leaves a payment younger than 24 h, and one Mollie cannot be asked about now", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fresh = await seedCheckout(db, { count: 1 });
    await db
      .update(payment)
      .set({ createdAt: new Date(NOW.getTime() - STALE_PAYMENT_AGE_MS + 1) })
      .where(eq(payment.id, fresh.paymentId));
    const down = await staleCheckout({ count: 1 });
    await molliePaymentFor(db, fake, down.paymentId, 5000);
    fake.failNext(503);
    const { outbox } = recordingOutbox();
    const { queue } = recordingQueue();

    const result = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });

    expect(result).toMatchObject({ cancelled: 0, deferred: 1, settled: 0 });
    expect((await paymentRow(db, fresh.paymentId)).status).toBe("open");
    expect((await paymentRow(db, down.paymentId)).status).toBe("open");
    error.mockRestore();
  });

  it("cancels locally a payment Mollie no longer knows", async () => {
    const seeded = await staleCheckout({
      count: 1,
      mollieId: "tr_unknownToMollie",
    });
    const { outbox } = recordingOutbox();
    const { queue } = recordingQueue();

    const result = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });

    expect(result).toMatchObject({ cancelled: 1, cancelledAtMollie: 0 });
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("canceled");
  });

  it("settles what Mollie already ended (expired) without cancelling", async () => {
    const seeded = await staleCheckout({ count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "expired");
    const { outbox } = recordingOutbox();
    const { queue } = recordingQueue();

    const result = await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });

    expect(result).toMatchObject({ cancelled: 1, cancelledAtMollie: 0 });
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("expired");
    expect(fake.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("hands the admin emails of a paid-but-mismatched payment to the outbox", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await makeAdmin(db);
    const seeded = await staleCheckout({ count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    fake.corruptAmount(mollieId, "1.00");
    const { outbox, sent } = recordingOutbox();
    const { queue } = recordingQueue();

    await runStaleSweep({
      db,
      email: outbox,
      events: queue,
      mollie: fake.mollie,
      now: NOW,
    });

    expect((await paymentRow(db, seeded.paymentId)).status).toBe(
      "refund_needed"
    );
    expect(sent.map((email) => email.template)).toContain(
      "transactional/admin-refund-needed"
    );
    error.mockRestore();
  });
});

describe("runStaleSweep's reconciliation (task 4 review)", () => {
  const paidLongAgo = new Date(NOW.getTime() - RECONCILE_GRACE_MS - 1);

  async function paidRendering(
    options: Parameters<typeof seedCheckout>[1] = {}
  ) {
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "paid",
      status: "rendering",
      ...options,
    });
    await db
      .update(payment)
      .set({ paidAt: paidLongAgo })
      .where(eq(payment.id, seeded.paymentId));
    return seeded;
  }

  async function sweepOnce(queue: QueueProducer<EventMessage>) {
    return await runStaleSweep({
      db,
      email: recordingOutbox().outbox,
      events: queue,
      mollie: null,
      now: NOW,
    });
  }

  it("re-sends payment.settled for a paid item rendering without a job, until the job exists", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seeded = await paidRendering();
    const { messages, queue } = recordingQueue();

    const first = await sweepOnce(queue);
    // Nothing consumed it (a lost message): the next hour sends it again.
    const second = await sweepOnce(queue);
    // The consumer creates the job (one per item, decided in D1)...
    await createRenderJob(db, {
      now: NOW,
      sponsorshipId: seeded.sponsorshipIds[0] as string,
    });
    // ...and from then on nothing is re-sent.
    const third = await sweepOnce(queue);
    const fourth = await sweepOnce(queue);

    expect([first, second, third, fourth].map((r) => r.resent)).toEqual([
      1, 1, 0, 0,
    ]);
    expect(messages).toEqual([
      { paymentId: seeded.paymentId, type: "payment.settled" },
      { paymentId: seeded.paymentId, type: "payment.settled" },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "[sponsorships] Re-sent payment.settled for 1 paid payment(s) with an item rendering and no render job"
    );
  });

  it("leaves a payment just paid, an item with a job, an unpaid payment and other statuses alone", async () => {
    const recent = await paidRendering();
    await db
      .update(payment)
      .set({ paidAt: new Date(NOW.getTime() - RECONCILE_GRACE_MS + 1000) })
      .where(eq(payment.id, recent.paymentId));
    const withJob = await paidRendering();
    await createRenderJob(db, {
      now: NOW,
      sponsorshipId: withJob.sponsorshipIds[0] as string,
    });
    await seedCheckout(db, { count: 1, status: "awaiting_payment" });
    await paidRendering({ status: "in_review" });
    await paidRendering({ status: "live" });
    const { messages, queue } = recordingQueue();

    const result = await sweepOnce(queue);

    expect(result.resent).toBe(0);
    expect(messages).toEqual([]);
  });

  it("sends one message per payment, at most RECONCILE_MAX_PAYMENTS per run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await paidRendering({ count: 2 });
    for (let i = 0; i < RECONCILE_MAX_PAYMENTS; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: fixtures, one checkout each.
      await paidRendering();
    }
    const { messages, queue } = recordingQueue();

    const result = await sweepOnce(queue);

    expect(RECONCILE_MAX_PAYMENTS).toBe(100);
    expect(result.resent).toBe(RECONCILE_MAX_PAYMENTS);
    const ids = messages.map((m) =>
      m.type === "payment.settled" ? m.paymentId : ""
    );
    expect(new Set(ids).size).toBe(RECONCILE_MAX_PAYMENTS);
  });

  it("logs and sends nothing without the EVENTS_QUEUE binding", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await paidRendering();

    const result = await runStaleSweep({
      db,
      email: recordingOutbox().outbox,
      events: undefined,
      mollie: null,
      now: NOW,
    });

    expect(result.resent).toBe(0);
    expect(error).toHaveBeenCalledWith(
      "[sponsorships] No EVENTS_QUEUE: 1 paid payment(s) wait for their render job"
    );
  });
});
