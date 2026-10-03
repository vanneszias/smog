import { env } from "cloudflare:workers";
import { createFakeMollie, type FakeMollie } from "@smog/payments/testing";
import { renderStarterFor } from "@smog/sponsorships/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    renderStarter: renderStarterFor("fake", { db }),
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
  it("render.requested with RENDER_MODE=container leaves the job queued and logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const checkout = await checkoutVia(fake, { count: 1 });
    fake.setStatus(checkout.mollieId, "paid");
    const requested = recordingQueue();
    const consumer = deps({
      queues: { email: recordingQueue(), events: requested },
      renderStarter: renderStarterFor("container", { db }),
    });
    const settledQueues = { email: recordingQueue(), events: recordingQueue() };
    await handleMollieWebhook(
      new Request(`${ORIGIN}/api/webhooks/mollie`, {
        body: `id=${checkout.mollieId}`,
        method: "POST",
      }),
      {
        db,
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
    expect(warn).toHaveBeenCalledWith(
      "[render] RENDER_MODE=container is not available before phase 7"
    );

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
