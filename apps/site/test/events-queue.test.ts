import { env, exports } from "cloudflare:workers";
import {
  createFakeMollie,
  FAKE_MOLLIE_API_KEY,
  type FakeMollie,
} from "@smog/payments/testing";
import { fakeRenderStarter } from "@smog/sponsorships/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { siteEnv } from "../src/server/auth";
import { handleMollieWebhook } from "../src/server/mollie-webhook";
import {
  type EventsDeps,
  eventRetryDelaySeconds,
  processEventMessage,
} from "../src/worker/events-queue";
import { mailTo, waitForMail } from "./helpers";
import {
  checkoutVia,
  jobsOf,
  kv,
  leaveQueued,
  makeAdmin,
  recordingQueue,
  statusesOf,
  testDb,
} from "./sponsorships";

const ORIGIN = "http://localhost:5173";
const db = testDb();
let fake: FakeMollie;

beforeEach(() => {
  fake = createFakeMollie();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function realQueues() {
  if (!(env.EMAIL_QUEUE && env.EVENTS_QUEUE)) {
    throw new Error("[test] The queue bindings are missing");
  }
  return { email: env.EMAIL_QUEUE, events: env.EVENTS_QUEUE };
}

async function webhook(mollieId: string): Promise<number> {
  const response = await handleMollieWebhook(
    new Request(`${ORIGIN}/api/webhooks/mollie`, {
      body: `id=${mollieId}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    }),
    {
      db,
      kv: kv(),
      limit: () => Promise.resolve(true),
      mollie: fake.mollie,
      queues: realQueues(),
    }
  );
  return response.status;
}

/** Polls until `check` passes (the queues run in the background). */
async function eventually(check: () => Promise<void>, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polling the background consumers.
      await check();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function deps(overrides: Partial<EventsDeps> = {}): EventsDeps {
  return {
    db,
    queues: { email: recordingQueue(), events: recordingQueue() },
    renderStarter: fakeRenderStarter(db),
    siteUrl: ORIGIN,
    ...overrides,
  };
}

describe("the events consumer, end to end on the real queues", () => {
  it("payment.settled → render jobs, fake render → in_review, and one set of emails even when it runs twice", async () => {
    const admin = await makeAdmin();
    const sponsor = `${crypto.randomUUID()}@smog.test`;
    const checkout = await checkoutVia(fake, { email: sponsor });
    fake.setStatus(checkout.mollieId, "paid");
    expect(await webhook(checkout.mollieId)).toBe(200);

    // The Worker's own consumers: the events queue renders (RENDER_MODE
    // is `fake` in dev) and the email queue sends to the dev mailbox.
    await eventually(async () => {
      expect(await statusesOf(checkout.sponsorshipIds)).toEqual([
        "in_review",
        "in_review",
      ]);
    });
    await eventually(async () => {
      expect(await mailTo(sponsor)).toHaveLength(4);
    });
    await waitForMail(admin.email);
    expect(
      (await jobsOf(checkout.sponsorshipIds)).map((j) => j.status)
    ).toEqual(["succeeded", "succeeded"]);

    // A duplicate payment.settled (a replayed webhook, a redelivery).
    const again = { email: recordingQueue(), events: recordingQueue() };
    expect(
      await processEventMessage(
        {
          attempts: 1,
          body: { paymentId: checkout.paymentId, type: "payment.settled" },
          id: "dup",
        },
        deps({ queues: again })
      )
    ).toEqual({ action: "ack" });
    expect(await jobsOf(checkout.sponsorshipIds)).toHaveLength(2);
    // Nothing is rendering any more, so no render is requested again; the
    // emails carry the same keys, which the email consumer skips.
    expect(again.events.messages).toEqual([]);
    const { email } = realQueues();
    for (const message of again.email.messages) {
      // biome-ignore lint/performance/noAwaitInLoops: in order, like the producer.
      await email.send(message, { contentType: "json" });
    }
    await email.send(
      {
        id: crypto.randomUUID(),
        locale: "nl",
        props: { name: "Alex", url: ORIGIN },
        template: "transactional/welcome",
        to: sponsor,
      },
      { contentType: "json" }
    );
    await eventually(async () => {
      expect(await mailTo(sponsor)).toHaveLength(5);
    });
    expect(await mailTo(admin.email)).toHaveLength(1);
  });
});

describe("processEventMessage", () => {
  it("render.requested hands a queued job to the starter; once completed, a second request is a no-op", async () => {
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    const requested = recordingQueue();
    const consumer = deps({
      queues: { email: recordingQueue(), events: requested },
      renderStarter: leaveQueued(),
    });
    const settledQueues = { email: recordingQueue(), events: recordingQueue() };
    await handleMollieWebhook(
      new Request(`${ORIGIN}/api/webhooks/mollie`, {
        body: `id=${checkout.mollieId}`,
        method: "POST",
      }),
      {
        db,
        kv: kv(),
        limit: () => Promise.resolve(true),
        mollie: fake.mollie,
        queues: settledQueues,
      }
    );
    const [settled] = settledQueues.events.messages;
    await processEventMessage(
      { attempts: 1, body: settled, id: "s" },
      consumer
    );
    const [request] = requested.messages;
    expect(request).toMatchObject({ type: "render.requested" });
    expect(
      await processEventMessage(
        { attempts: 1, body: request, id: "r" },
        consumer
      )
    ).toEqual({ action: "ack" });
    expect(
      (await jobsOf(checkout.sponsorshipIds)).map((j) => j.status)
    ).toEqual(["queued"]);
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual(["rendering"]);

    // The fake starter completes it; a second request is a no-op.
    const fakeRender = deps();
    await processEventMessage(
      { attempts: 1, body: request, id: "r2" },
      fakeRender
    );
    await processEventMessage(
      { attempts: 1, body: request, id: "r3" },
      fakeRender
    );
    expect(await statusesOf(checkout.sponsorshipIds)).toEqual(["in_review"]);
    expect(
      (await jobsOf(checkout.sponsorshipIds)).map((j) => j.status)
    ).toEqual(["succeeded"]);
  });

  it("retries a failing message with backoff (the DLQ follows max_retries)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    await handleMollieWebhook(
      new Request(`${ORIGIN}/api/webhooks/mollie`, {
        body: `id=${checkout.mollieId}`,
        method: "POST",
      }),
      {
        db,
        kv: kv(),
        limit: () => Promise.resolve(true),
        mollie: fake.mollie,
        queues: { email: recordingQueue(), events: recordingQueue() },
      }
    );
    const body = { paymentId: checkout.paymentId, type: "payment.settled" };
    const noQueues = deps({ queues: {} });
    expect(
      await processEventMessage({ attempts: 1, body, id: "a" }, noQueues)
    ).toEqual({ action: "retry", delaySeconds: 30 });
    expect(
      await processEventMessage({ attempts: 3, body, id: "b" }, noQueues)
    ).toEqual({ action: "retry", delaySeconds: 120 });
    expect(eventRetryDelaySeconds(10)).toBe(3600);
    // The retries created the job once.
    expect(await jobsOf(checkout.sponsorshipIds)).toHaveLength(1);
  });

  it("acks an invalid message and a render.requested for an unknown job", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await processEventMessage(
        { attempts: 1, body: { x: 1 }, id: "x" },
        deps()
      )
    ).toEqual({ action: "ack" });
    expect(
      await processEventMessage(
        {
          attempts: 1,
          body: { renderJobId: "missing", type: "render.requested" },
          id: "y",
        },
        deps()
      )
    ).toEqual({ action: "ack" });
  });
});

/**
 * Waits until every queued email to `addresses` is delivered: a sentinel
 * welcome email is queued to each after them and awaited, so the counts
 * read afterwards are final (the email queue runs in order).
 */
async function settleMailbox(addresses: readonly string[]): Promise<void> {
  const { email } = realQueues();
  const marker = `sentinel-${crypto.randomUUID()}`;
  for (const to of addresses) {
    // biome-ignore lint/performance/noAwaitInLoops: in order, after the real ones.
    await email.send(
      {
        id: crypto.randomUUID(),
        locale: "nl",
        props: { name: marker, url: ORIGIN },
        template: "transactional/welcome",
        to,
      },
      { contentType: "json" }
    );
  }
  for (const to of addresses) {
    // biome-ignore lint/performance/noAwaitInLoops: one mailbox at a time.
    await waitForMail(to, { match: ({ text }) => text.includes(marker) });
  }
}

/** The real mails to `to`, minus the sentinels. */
async function realMail(to: string) {
  return (await mailTo(to)).filter((m) => !m.text.includes("sentinel-"));
}

describe("enqueue fails → 503 → Mollie retries → exactly one effect (I-3)", () => {
  function webhookWith(
    mollieId: string,
    queues: Parameters<typeof handleMollieWebhook>[1]["queues"]
  ) {
    return handleMollieWebhook(
      new Request(`${ORIGIN}/api/webhooks/mollie`, {
        body: `id=${mollieId}`,
        method: "POST",
      }),
      {
        db,
        kv: kv(),
        limit: () => Promise.resolve(true),
        mollie: fake.mollie,
        queues,
      }
    );
  }

  /** Runs the consumer on `messages`, its emails on the real email queue. */
  async function consume(messages: readonly unknown[]) {
    const consumer = deps({
      queues: { email: realQueues().email, events: recordingQueue() },
      renderStarter: leaveQueued(),
    });
    for (const [index, body] of messages.entries()) {
      // biome-ignore lint/performance/noAwaitInLoops: one message at a time.
      const decision = await processEventMessage(
        { attempts: 1, body, id: String(index) },
        consumer
      );
      expect(decision).toEqual({ action: "ack" });
    }
  }

  it("a paid payment whose first events enqueue fails: one job per item, 2n sponsor emails, one per admin", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = await makeAdmin();
    const sponsor = `${crypto.randomUUID()}@smog.test`;
    const checkout = await checkoutVia(fake, { email: sponsor });
    fake.setStatus(checkout.mollieId, "paid");
    const events = recordingQueue();
    const first = await webhookWith(checkout.mollieId, {
      email: realQueues().email,
      events: recordingQueue({ fail: true }),
    });
    expect(first.status).toBe(503);
    const retry = await webhookWith(checkout.mollieId, {
      email: realQueues().email,
      events,
    });
    expect(retry.status).toBe(200);
    await consume(events.messages);
    // The message delivered twice (a redelivery): no second effect.
    await consume(events.messages);
    expect(await jobsOf(checkout.sponsorshipIds)).toHaveLength(2);
    await settleMailbox([sponsor, admin.email]);
    expect(await realMail(sponsor)).toHaveLength(4);
    expect(await realMail(admin.email)).toHaveLength(1);
  });

  it("a partial failure (events out, the email fails): the retry adds no job and one refund email per admin", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = await makeAdmin();
    const sponsor = `${crypto.randomUUID()}@smog.test`;
    const late = await checkoutVia(fake, { email: sponsor });
    fake.setStatus(late.mollieId, "canceled");
    await webhookWith(late.mollieId, {
      email: recordingQueue(),
      events: recordingQueue(),
    });
    // Someone takes the second gesture; then the late payment arrives.
    const [, second] = late.gestures;
    if (!second) {
      throw new Error("[test] Two gestures expected");
    }
    await checkoutVia(fake, { gestures: [second] });
    fake.setStatus(late.mollieId, "paid");
    const events = recordingQueue();
    const first = await webhookWith(late.mollieId, {
      email: recordingQueue({ fail: true }),
      events,
    });
    expect(first.status).toBe(503);
    // `payment.settled` went out before the email failed.
    expect(events.messages).toHaveLength(1);
    const retry = await webhookWith(late.mollieId, {
      email: realQueues().email,
      events,
    });
    expect(retry.status).toBe(200);
    expect(events.messages).toHaveLength(2);
    await consume(events.messages);
    expect(await jobsOf(late.sponsorshipIds)).toHaveLength(1);
    expect(await statusesOf(late.sponsorshipIds)).toContain("cancelled");
    await settleMailbox([sponsor, admin.email]);
    // The revived item's two emails; the admin: the new sponsorship (the
    // revived item) and exactly one refund-needed email.
    expect(await realMail(sponsor)).toHaveLength(2);
    expect(await realMail(admin.email)).toHaveLength(2);
  });
});

describe("serveMollieWebhook, wired to this Worker (I-3)", () => {
  it("re-fetches with the key, settles, and the Worker's own queues render and mail", async () => {
    const { worker } = siteEnv();
    const key = worker.MOLLIE_API_KEY;
    worker.MOLLIE_API_KEY = FAKE_MOLLIE_API_KEY;
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.startsWith("/v2/payments")) {
        calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
        return fake.fetch(input, init);
      }
      return realFetch(input, init);
    });
    try {
      const sponsor = `${crypto.randomUUID()}@smog.test`;
      const checkout = await checkoutVia(fake, { count: 1, email: sponsor });
      fake.setStatus(checkout.mollieId, "paid");
      const response = await exports.default.fetch(
        `${ORIGIN}/api/webhooks/mollie`,
        {
          body: `id=${checkout.mollieId}`,
          headers: {
            "cf-connecting-ip": crypto.randomUUID(),
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        }
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-smog-webhook")).toBe("OK");
      expect(calls).toEqual([`GET /v2/payments/${checkout.mollieId}`]);
      await eventually(async () => {
        expect(await statusesOf(checkout.sponsorshipIds)).toEqual([
          "in_review",
        ]);
      });
      await eventually(async () => {
        expect(await mailTo(sponsor)).toHaveLength(2);
      });
    } finally {
      worker.MOLLIE_API_KEY = key;
    }
  });
});
