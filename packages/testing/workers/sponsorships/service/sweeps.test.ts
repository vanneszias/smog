/**
 * The lifecycle crons (ruling 9): expiry (J-01), the renewal reminder
 * (J-02) and the stale payments (J-03). Each sweep runs twice and must
 * produce one effect: one transition, one email, one token, one deletion.
 */
import {
  payment,
  renderJob,
  sponsorship,
  sponsorshipEvent,
  sponsorshipToken,
} from "@smog/db";
import type { OutboxEmail } from "@smog/email";
import type { EmailMessage, EventMessage, JobQueues } from "@smog/jobs";
import type { MollieClient } from "@smog/payments";
import { DAY_MS, newId } from "@smog/utils";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSponsorshipToken } from "../../../../features/sponsorships/src/schema/index";
import { RENDER_RETIRED_ERROR } from "../../../../features/sponsorships/src/server/retire-render";
import { settleFromMollie } from "../../../../features/sponsorships/src/server/settle";
import { handlePaymentSettled } from "../../../../features/sponsorships/src/server/settled";
import {
  REMINDER_WINDOW_MS,
  runExpirySweep,
  runReminderSweep,
  runStaleSweep,
  STALE_PAYMENT_AGE_MS,
} from "../../../../features/sponsorships/src/server/sweeps";
import { makeGesture } from "../../../support/db/index";
import {
  createFakeMollie,
  type FakeMollie,
} from "../../../support/payments/index";
import { createFakeMux, type FakeMux } from "../../../support/video/index";
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

afterEach(() => {
  vi.restoreAllMocks();
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
    // The token is in the fragment, never in a query (phase 9 ruling 7).
    expect(url.search).toBe("");
    const raw = new URLSearchParams(url.hash.slice(1)).get("token") ?? "";
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
      `[sponsorships] Failed to queue the renewal reminder for ${id}; an admin must regenerate its renewal link:`,
      expect.any(Error)
    );
    error.mockRestore();
  });
});

/** Both queues, recording: events and emails. */
function recordingQueues() {
  const events: EventMessage[] = [];
  const emails: EmailMessage[] = [];
  const queues: JobQueues = {
    email: {
      send: (body) => {
        emails.push(body);
        return Promise.resolve();
      },
    },
    events: {
      send: (body) => {
        events.push(body);
        return Promise.resolve();
      },
    },
  };
  return { emails, events, queues };
}

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

  async function sweep(
    queues: JobQueues,
    mollie = fake.mollie as MollieClient | null
  ) {
    return await runStaleSweep({
      db,
      mollie,
      now: NOW,
      queues,
    });
  }

  it("settles a payment Mollie reports paid, never cancels it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seeded = await staleCheckout();
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    const { events, queues } = recordingQueues();

    const first = await sweep(queues);
    const second = await sweep(queues);

    expect(first).toMatchObject({ cancelled: 0, settled: 1 });
    expect(second).toMatchObject({ cancelled: 0, settled: 0 });
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("paid");
    for (const id of seeded.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows, in order.
      expect((await sponsorshipRow(db, id)).status).toBe("in_review");
    }
    // The settle's fan-out; the reconciliation may re-send it (no consumer
    // creates the render jobs here).
    expect(events[0]).toEqual({
      paymentId: seeded.paymentId,
      type: "payment.settled",
    });
    expect(
      events.every(
        (m) => m.type === "payment.settled" && m.paymentId === seeded.paymentId
      )
    ).toBe(true);
    expect(fake.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("a payment paid at Mollie 8 days ago and settled now still gets every email (fix wave, jobs I-1)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await makeAdmin(db);
    const seeded = await staleCheckout();
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    const stored = fake.payments.get(mollieId);
    if (!stored) {
      throw new Error("[test] No fake payment");
    }
    stored.paidAt = new Date(NOW.getTime() - 8 * DAY_MS);
    const { events, queues } = recordingQueues();

    expect(await sweep(queues)).toMatchObject({ settled: 1 });
    expect(events[0]).toEqual({
      paymentId: seeded.paymentId,
      type: "payment.settled",
    });
    // The events consumer drains the queue.
    const out = await handlePaymentSettled(db, {
      now: NOW,
      paymentId: seeded.paymentId,
      siteUrl: SITE_URL,
    });
    expect(out.events).toEqual([]);
    const templates = out.notify.map((email) => email.template);
    expect(
      templates.filter((t) => t === "transactional/sponsorship-received")
    ).toHaveLength(2);
    expect(
      templates.filter((t) => t === "transactional/payment-confirmed")
    ).toHaveLength(2);
    expect(templates).toContain("transactional/admin-new-sponsorship");
  });

  it("cancels a cancelable payment in Mollie and frees the gestures", async () => {
    const seeded = await staleCheckout();
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    const { events, queues } = recordingQueues();

    const first = await sweep(queues);
    const second = await sweep(queues);

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
    expect(events).toEqual([]);
  });

  it("keeps a payment with a Mollie id open without a key (I-2), and cancels one without a Mollie id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const withId = await staleCheckout({ mollieId: "tr_noKeyPayment1" });
    // A crash between the checkout batch and Mollie: no `mollie_id`.
    const noId = await staleCheckout();
    const { queues } = recordingQueues();

    const first = await sweep(queues, null);
    const second = await sweep(queues, null);

    expect(first).toMatchObject({
      cancelled: 1,
      cancelledAtMollie: 0,
      keptOpen: 1,
    });
    expect(second).toMatchObject({ cancelled: 0, keptOpen: 1 });
    expect((await paymentRow(db, withId.paymentId)).status).toBe("open");
    for (const id of withId.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows, in order.
      expect((await sponsorshipRow(db, id)).status).toBe("awaiting_payment");
    }
    expect(warn).toHaveBeenCalledWith(
      `[sponsorships] No MOLLIE_API_KEY: the stale payment ${withId.paymentId} has a Mollie id and is left open`
    );
    expect((await paymentRow(db, noId.paymentId)).status).toBe("canceled");
    for (const id of noId.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows, in order.
      const trail = await eventsOf(db, id);
      expect((await sponsorshipRow(db, id)).status).toBe("cancelled");
      expect(trail.at(-1)).toMatchObject({
        data: { paymentId: noId.paymentId, reason: "stale" },
        type: "cancelled",
      });
    }
    expect(fake.requests).toHaveLength(0);
  });

  it("keeps open a payment Mollie does not know (404) or cannot cancel (I-2)", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unknown = await staleCheckout({
      count: 1,
      mollieId: "tr_unknownToMollie",
    });
    const pending = await staleCheckout({ count: 1 });
    const pendingId = await molliePaymentFor(db, fake, pending.paymentId, 5000);
    fake.setStatus(pendingId, "pending");
    const { queues } = recordingQueues();

    const result = await sweep(queues);

    expect(result).toMatchObject({ cancelled: 0, keptOpen: 2 });
    expect((await paymentRow(db, unknown.paymentId)).status).toBe("open");
    expect((await paymentRow(db, pending.paymentId)).status).toBe("open");
    expect(error).toHaveBeenCalledWith(
      `[sponsorships] Mollie does not know tr_unknownToMollie of the stale payment ${unknown.paymentId} (a key of another profile?); it is left open`
    );
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
    const { queues } = recordingQueues();

    const first = await sweep(queues, null);
    const second = await sweep(queues, null);

    expect(first.cancelled).toBe(1);
    expect(second.cancelled).toBe(0);
    expect((await paymentRow(db, paymentId)).status).toBe("canceled");
    expect((await sponsorshipRow(db, id)).status).toBe("expiring");
    expect(await eventsOf(db, id)).toHaveLength(0);
  });

  it("leaves a payment younger than 24 h, and one Mollie cannot be asked about now", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fresh = await seedCheckout(db, { count: 1 });
    await db
      .update(payment)
      .set({ createdAt: new Date(NOW.getTime() - STALE_PAYMENT_AGE_MS + 1) })
      .where(eq(payment.id, fresh.paymentId));
    const down = await staleCheckout({ count: 1 });
    await molliePaymentFor(db, fake, down.paymentId, 5000);
    fake.failNext(503);
    const { queues } = recordingQueues();

    const result = await sweep(queues);

    expect(result).toMatchObject({ cancelled: 0, deferred: 1, settled: 0 });
    expect((await paymentRow(db, fresh.paymentId)).status).toBe("open");
    expect((await paymentRow(db, down.paymentId)).status).toBe("open");
  });

  it("settles what Mollie already ended (expired) without cancelling", async () => {
    const seeded = await staleCheckout({ count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "expired");
    const { queues } = recordingQueues();

    const result = await sweep(queues);

    expect(result).toMatchObject({ cancelled: 1, cancelledAtMollie: 0 });
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("expired");
    expect(fake.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("queues the admin emails of a paid-but-mismatched payment", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await makeAdmin(db);
    const seeded = await staleCheckout({ count: 1 });
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 5000);
    fake.setStatus(mollieId, "paid");
    fake.corruptAmount(mollieId, "1.00");
    const { emails, queues } = recordingQueues();

    await sweep(queues);

    expect((await paymentRow(db, seeded.paymentId)).status).toBe(
      "refund_needed"
    );
    expect(emails.map((email) => email.template)).toContain(
      "transactional/admin-refund-needed"
    );
  });

  it("a webhook settling while the sweep runs: one paid state, no failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seeded = await staleCheckout();
    const mollieId = await molliePaymentFor(db, fake, seeded.paymentId, 10_000);
    fake.setStatus(mollieId, "paid");
    const { queues } = recordingQueues();

    const [swept] = await Promise.all([
      sweep(queues),
      settleFromMollie(db, fake.mollie, { mollieId, now: NOW }),
    ]);

    expect(swept.failed).toBe(0);
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("paid");
    for (const id of seeded.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows, in order.
      const trail = await eventsOf(db, id);
      expect(trail.filter((e) => e.type === "payment_paid")).toHaveLength(1);
    }
  });
});

describe("runStaleSweep retires the render states (phase 10b task 9)", () => {
  async function sweepOnce(now = NOW) {
    return await runStaleSweep({
      db,
      mollie: null,
      now,
      queues: { email: undefined, events: undefined },
    });
  }

  async function seedJob(sponsorshipId: string, status: "queued" | "running") {
    const id = newId();
    await db.insert(renderJob).values({
      attempt: 1,
      createdAt: NOW,
      id,
      input: {},
      sponsorshipId,
      status,
      updatedAt: NOW,
      workflowInstanceId: id,
    });
    return id;
  }

  it("moves rendering and render_failed rows to in_review with a trail event, and closes their open jobs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rendering = await one({ paymentStatus: "paid", status: "rendering" });
    const failed = await one({
      paymentStatus: "paid",
      status: "render_failed",
    });
    const live = await one({ paymentStatus: "paid", status: "live" });
    const queuedJob = await seedJob(rendering.id, "queued");
    const runningJob = await seedJob(rendering.id, "running");

    const result = await sweepOnce();
    expect(result).toMatchObject({ retired: 2, retireFailed: 0 });
    expect((await sponsorshipRow(db, rendering.id)).status).toBe("in_review");
    expect((await sponsorshipRow(db, failed.id)).status).toBe("in_review");
    expect((await sponsorshipRow(db, live.id)).status).toBe("live");
    const trails = await Promise.all(
      [rendering.id, failed.id].map((id) => eventsOf(db, id))
    );
    for (const trail of trails) {
      const retired = trail.filter(
        (event) => event.type === "render_succeeded"
      );
      expect(retired).toHaveLength(1);
      expect(retired[0]).toMatchObject({
        actorId: null,
        data: { retired: true },
      });
    }
    const jobs = await db
      .select()
      .from(renderJob)
      .where(inArray(renderJob.id, [queuedJob, runningJob]));
    expect(jobs.map((job) => job.status)).toEqual(["failed", "failed"]);
    expect(jobs.every((job) => job.error === RENDER_RETIRED_ERROR)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("is idempotent: a second run changes nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { id } = await one({ paymentStatus: "paid", status: "rendering" });
    await sweepOnce();
    const second = await sweepOnce();
    expect(second).toMatchObject({ retired: 0, retireFailed: 0 });
    expect(
      (await eventsOf(db, id)).filter(
        (event) => event.type === "render_succeeded"
      )
    ).toHaveLength(1);
  });

  it("keeps a rendered video the row already has", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { id } = await one({
      paymentStatus: "paid",
      status: "render_failed",
    });
    await db
      .update(sponsorship)
      .set({ videoPlaybackId: "rendered-playback" })
      .where(eq(sponsorship.id, id));
    await sweepOnce();
    expect(await sponsorshipRow(db, id)).toMatchObject({
      status: "in_review",
      videoPlaybackId: "rendered-playback",
    });
  });

  it("moves more than one page of rows", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seeded = await seedCheckout(db, {
      count: 105,
      paymentStatus: "paid",
      status: "rendering",
    });
    const result = await sweepOnce();
    expect(result.retired).toBe(105);
    expect(
      (
        await db
          .select()
          .from(sponsorship)
          .where(eq(sponsorship.status, "in_review"))
      ).length
    ).toBe(seeded.sponsorshipIds.length);
  });
});

describe("runReminderSweep in parallel (M-8)", () => {
  it("two runs at once: one reminder, one token, one email", async () => {
    const { id } = await one({
      endsAt: new Date(NOW.getTime() + 5 * DAY_MS),
      paymentStatus: "paid",
      status: "live",
    });
    const { outbox, sent } = recordingOutbox();

    const results = await Promise.all([
      runReminderSweep({ db, email: outbox, now: NOW, siteUrl: SITE_URL }),
      runReminderSweep({ db, email: outbox, now: NOW, siteUrl: SITE_URL }),
    ]);

    expect(results.map((r) => r.reminded).sort()).toEqual([0, 1]);
    expect(results.every((r) => r.failed === 0)).toBe(true);
    expect(sent).toHaveLength(1);
    const tokens = await db
      .select()
      .from(sponsorshipToken)
      .where(eq(sponsorshipToken.sponsorshipId, id));
    expect(tokens).toHaveLength(1);
    const trail = (await eventsOf(db, id)).map((event) => event.type);
    expect(trail).toEqual(["token_issued", "reminder_sent"]);
  });
});
