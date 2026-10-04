import { exports } from "cloudflare:workers";
import { MAINTENANCE_KV_KEY } from "@smog/config/maintenance";
import { createPayment } from "@smog/payments";
import { createFakeMollie, type FakeMollie } from "@smog/payments/testing";
import { markFanout } from "@smog/sponsorships/server";
import { DAY_MS } from "@smog/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleMollieWebhook,
  type MollieWebhookDeps,
} from "../src/server/mollie-webhook";
import { processEventMessage } from "../src/worker/events-queue";
import { clearMaintenanceCache } from "../src/worker/maintenance";
import {
  checkoutVia,
  jobsOf,
  kv,
  leaveQueued,
  makeAdmin,
  paymentStatusOf,
  type RecordingQueue,
  recordingQueue,
  statusesOf,
  testDb,
  trailTypes,
} from "./sponsorships";

const ORIGIN = "http://localhost:5173";
const db = testDb();

let fake: FakeMollie;
let queues: { email: RecordingQueue; events: RecordingQueue };
let limit: ReturnType<typeof vi.fn<(key: string) => Promise<boolean>>>;

beforeEach(() => {
  fake = createFakeMollie();
  queues = { email: recordingQueue(), events: recordingQueue() };
  limit = vi.fn(() => Promise.resolve(true));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function deps(overrides: Partial<MollieWebhookDeps> = {}): MollieWebhookDeps {
  return { db, kv: kv(), limit, mollie: fake.mollie, queues, ...overrides };
}

function form(id: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/webhooks/mollie`, {
    body: `id=${encodeURIComponent(id)}`,
    headers: {
      "cf-connecting-ip": "203.0.113.9",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    method: "POST",
  });
}

async function deliver(
  request: Request,
  overrides: Partial<MollieWebhookDeps> = {}
): Promise<{ code: string; status: number }> {
  const response = await handleMollieWebhook(request, deps(overrides));
  const code = response.headers.get("x-smog-webhook") ?? "";
  if (response.ok) {
    // A 2xx has an empty body (M-8).
    expect(await response.text()).toBe("");
  } else {
    expect(await response.json()).toEqual({ code });
  }
  return { code, status: response.status };
}

/**
 * Runs the events consumer on every `EVENTS_QUEUE` message so far; its
 * emails go to `email` (a recording queue by default, or the real one).
 */
async function drainEvents(
  options: { email?: RecordingQueue | Queue; now?: Date } = {}
): Promise<void> {
  const consumer = {
    db,
    now: () => options.now ?? new Date(),
    queues: {
      email: options.email ?? recordingQueue(),
      events: recordingQueue(),
    },
    renderStarter: leaveQueued(),
    siteUrl: ORIGIN,
  };
  const messages = queues.events.messages.splice(0);
  for (const [index, body] of messages.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: the consumer runs one message at a time.
    const decision = await processEventMessage(
      { attempts: 1, body, id: String(index) },
      consumer
    );
    expect(decision).toEqual({ action: "ack" });
  }
}

const settled = (paymentId: string) => ({
  paymentId,
  type: "payment.settled",
});

describe("the Mollie webhook (ruling 2)", () => {
  it("settles a paid payment from a form body and enqueues payment.settled", async () => {
    const checkout = await checkoutVia(fake);
    fake.setStatus(checkout.mollieId, "paid");
    expect(await deliver(form(checkout.mollieId))).toEqual({
      code: "OK",
      status: 200,
    });
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual([
      "rendering",
      "rendering",
    ]);
    expect(queues.events.messages).toEqual([settled(checkout.paymentId)]);
    expect(limit).not.toHaveBeenCalled();
  });

  it("takes the id from a JSON body too, as the old handler did", async () => {
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    const request = new Request(`${ORIGIN}/api/webhooks/mollie`, {
      body: JSON.stringify({ id: checkout.mollieId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect((await deliver(request)).status).toBe(200);
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual(["rendering"]);
  });

  it("never trusts the body: only Mollie's re-fetched status counts", async () => {
    const checkout = await checkoutVia(fake, { count: 1 });
    // Still open at Mollie: a forged "paid" pointer changes nothing.
    expect((await deliver(form(checkout.mollieId))).status).toBe(200);
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual([
      "awaiting_payment",
    ]);
    expect(queues.events.messages).toEqual([]);
  });

  it("answers 400 for a missing or malformed id, counted against RL_API, and 429 past it", async () => {
    for (const body of ["", "id=", "id=tr_", "id=pay_1234", "id=tr_ab$cd"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one body at a time.
      const response = await handleMollieWebhook(
        new Request(`${ORIGIN}/api/webhooks/mollie`, {
          body,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          method: "POST",
        }),
        deps()
      );
      expect(response.status, body).toBe(400);
    }
    expect(limit).toHaveBeenCalledTimes(5);
    expect(limit).toHaveBeenCalledWith("mollie-webhook:unknown");
    limit.mockResolvedValue(false);
    expect((await deliver(form("nope"))).status).toBe(429);
  });

  it("answers 413 for a body over 4 KiB", async () => {
    const response = await handleMollieWebhook(
      new Request(`${ORIGIN}/api/webhooks/mollie`, {
        body: `id=tr_abcd&pad=${"x".repeat(5000)}`,
        method: "POST",
      }),
      deps()
    );
    expect(response.status).toBe(413);
  });

  it("answers 200 for an id Mollie does not know, counted", async () => {
    expect(await deliver(form("tr_unknown1234"))).toEqual({
      code: "UNKNOWN",
      status: 200,
    });
    expect(limit).toHaveBeenCalledTimes(1);
    expect(fake.requests.at(-1)).toMatchObject({
      method: "GET",
      path: "/v2/payments/tr_unknown1234",
    });
  });

  it("answers 200 for a payment that is not ours, not counted", async () => {
    const other = createFakeMollie();
    const { id } = await createPayment(other.mollie, {
      amountCents: 1000,
      description: "Elsewhere",
      idempotencyKey: crypto.randomUUID(),
      locale: "nl",
      metadata: { paymentId: crypto.randomUUID() },
      redirectUrl: "https://example.test/",
    });
    expect(await deliver(form(id), { mollie: other.mollie })).toEqual({
      code: "NOT_OURS",
      status: 200,
    });
    expect(limit).not.toHaveBeenCalled();
  });

  it("answers 503 when Mollie fails or there is no key, so Mollie retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.failNext(502);
    expect((await deliver(form(checkout.mollieId))).status).toBe(503);
    expect(await deliver(form(checkout.mollieId), { mollie: null })).toEqual({
      code: "NOT_CONFIGURED",
      status: 503,
    });
    expect(limit).not.toHaveBeenCalled();
  });

  it("answers 503 when the enqueue fails after the settle; the retry re-sends", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    const down = {
      email: recordingQueue(),
      events: recordingQueue({ fail: true }),
    };
    expect(await deliver(form(checkout.mollieId), { queues: down })).toEqual({
      code: "ENQUEUE_FAILED",
      status: 503,
    });
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual(["rendering"]);
    // Mollie's retry: already paid, and payment.settled goes out again.
    expect((await deliver(form(checkout.mollieId))).status).toBe(200);
    expect(queues.events.messages).toEqual([settled(checkout.paymentId)]);
  });

  it("re-enqueues an `already` fan-out at most once a minute per payment (M-1)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    await deliver(form(checkout.mollieId));
    expect(queues.events.messages).toHaveLength(1);
    // A failed `already` enqueue writes no marker: Mollie's retry resends.
    const down = {
      email: recordingQueue(),
      events: recordingQueue({ fail: true }),
    };
    expect(
      (await deliver(form(checkout.mollieId), { queues: down })).status
    ).toBe(503);
    await deliver(form(checkout.mollieId));
    expect(queues.events.messages).toHaveLength(2);
    // Now marked: replays within the minute answer 200 and enqueue nothing.
    await deliver(form(checkout.mollieId));
    await deliver(form(checkout.mollieId));
    expect(queues.events.messages).toHaveLength(2);
    await kv().delete(`mollie:fanout:${checkout.paymentId}`);
    await deliver(form(checkout.mollieId));
    expect(queues.events.messages).toHaveLength(3);
  });

  it("a throttled `already` still enqueues its admin emails: a chargeback is told (fix wave, payments M-1)", async () => {
    const admin = await makeAdmin();
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    await deliver(form(checkout.mollieId));
    // A replay marks the fan-out...
    await deliver(form(checkout.mollieId));
    expect(queues.events.messages).toHaveLength(2);
    // ...and the chargeback webhook within the minute is `already` too.
    fake.chargeback(checkout.mollieId, 5000);
    expect(await deliver(form(checkout.mollieId))).toEqual({
      code: "OK",
      status: 200,
    });
    expect(queues.events.messages).toHaveLength(2);
    expect(queues.email.messages).toContainEqual(
      expect.objectContaining({
        idempotencyKey: `admin_chargeback:${checkout.paymentId}:5000:${admin.id}`,
        to: admin.email,
      })
    );
  });

  it("an `already` right after the return page's poll fanned out sends no second payment.settled (fix wave, payments M-2)", async () => {
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    await deliver(form(checkout.mollieId));
    expect(queues.events.messages).toHaveLength(1);
    // What `sponsorships.paymentStatus` writes after its own enqueue.
    await markFanout(kv(), checkout.paymentId);
    await deliver(form(checkout.mollieId));
    expect(queues.events.messages).toHaveLength(1);
  });

  it("a refund webhook 30 days after payment fans out again but sends no email (I-1)", async () => {
    const admin = await makeAdmin();
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    await deliver(form(checkout.mollieId));
    const first = recordingQueue();
    await drainEvents({ email: first });
    expect(first.messages.length).toBeGreaterThan(0);
    const later = new Date(Date.now() + 30 * DAY_MS);
    fake.refund(checkout.mollieId, 5000);
    expect(
      (await deliver(form(checkout.mollieId), { now: () => later })).status
    ).toBe(200);
    expect(queues.events.messages).toEqual([settled(checkout.paymentId)]);
    const again = recordingQueue();
    await drainEvents({ email: again, now: later });
    expect(again.messages).toEqual([]);
    expect(JSON.stringify(again.messages)).not.toContain(admin.email);
    expect(await jobsOf(checkout.sponsorshipIds)).toHaveLength(1);
  });

  it("a replay and a concurrent storm leave one state and, through the consumer, one render job per item", async () => {
    const checkout = await checkoutVia(fake);
    fake.setStatus(checkout.mollieId, "paid");
    const answers = await Promise.all(
      Array.from({ length: 6 }, () => deliver(form(checkout.mollieId)))
    );
    expect(answers.every((a) => a.status === 200)).toBe(true);
    expect((await deliver(form(checkout.mollieId))).status).toBe(200);
    for (const id of checkout.sponsorshipIds) {
      // biome-ignore lint/performance/noAwaitInLoops: one trail per sponsorship.
      expect(await trailTypes(id)).toEqual(["created", "payment_paid"]);
    }
    // Each delivery may enqueue payment.settled (ruling 6; the fan-out
    // marker skips some `already` ones); the consumer is idempotent: one
    // job per item, however many messages run.
    expect(queues.events.messages.length).toBeGreaterThanOrEqual(1);
    expect(queues.events.messages.length).toBeLessThanOrEqual(7);
    await drainEvents();
    const jobs = await jobsOf(checkout.sponsorshipIds);
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((job) => job.sponsorshipId)).size).toBe(2);
    expect(jobs.every((job) => job.status === "queued")).toBe(true);
  });

  it("out of order: canceled after paid leaves the payment paid", async () => {
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    await deliver(form(checkout.mollieId));
    fake.setStatus(checkout.mollieId, "canceled");
    expect((await deliver(form(checkout.mollieId))).status).toBe(200);
    expect(await paymentStatusOf(checkout.paymentId)).toBe("paid");
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual(["rendering"]);
  });

  it("a late payment with its gestures still free is revived", async () => {
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "expired");
    await deliver(form(checkout.mollieId));
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual(["cancelled"]);
    fake.setStatus(checkout.mollieId, "paid");
    expect((await deliver(form(checkout.mollieId))).status).toBe(200);
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual(["rendering"]);
    expect(queues.events.messages).toEqual([settled(checkout.paymentId)]);
  });

  it("a late payment whose gesture is taken is refund_needed, emails the admins and still answers 200", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = await makeAdmin();
    const first = await checkoutVia(fake, { count: 1 });
    fake.setStatus(first.mollieId, "canceled");
    await deliver(form(first.mollieId));
    // Someone else takes the gesture meanwhile.
    await checkoutVia(fake, { gestures: first.gestures });
    fake.setStatus(first.mollieId, "paid");
    expect((await deliver(form(first.mollieId))).status).toBe(200);
    expect(await paymentStatusOf(first.paymentId)).toBe("refund_needed");
    expect(queues.email.messages).toContainEqual(
      expect.objectContaining({
        idempotencyKey: `admin_refund_needed:${first.paymentId}:${admin.id}`,
        template: "transactional/admin-refund-needed",
        to: admin.email,
      })
    );
  });
});

describe("the webhook routes on the Worker", () => {
  afterEach(async () => {
    await kv().delete(MAINTENANCE_KV_KEY);
    clearMaintenanceCache();
  });

  it("serves /api/webhooks/mollie with no Origin (no key in tests: 503)", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/webhooks/mollie`,
      {
        body: "id=tr_abcd1234",
        headers: {
          "cf-connecting-ip": crypto.randomUUID(),
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "NOT_CONFIGURED" });
  });

  it("serves the legacy /webhooks/mollie alias, never as a redirect, also during maintenance", async () => {
    await kv().put(
      MAINTENANCE_KV_KEY,
      JSON.stringify({ bypassVersion: 1, enabled: true })
    );
    clearMaintenanceCache();
    const legacy = vi.spyOn(console, "warn");
    const response = await exports.default.fetch(`${ORIGIN}/webhooks/mollie`, {
      body: "id=tr_abcd1234",
      headers: {
        "cf-connecting-ip": crypto.randomUUID(),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      redirect: "manual",
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "NOT_CONFIGURED" });
    expect(legacy).toHaveBeenCalledWith("[mollie] legacy webhook path used");
    const bad = await exports.default.fetch(`${ORIGIN}/webhooks/mollie`, {
      body: "id=nope",
      headers: { "cf-connecting-ip": crypto.randomUUID() },
      method: "POST",
      redirect: "manual",
    });
    expect(bad.status).toBe(400);
    await bad.body?.cancel();
  });
});
