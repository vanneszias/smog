import {
  createExecutionContext,
  createMessageBatch,
  getQueueResult,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker";
import { queueKind } from "../src/worker/queues";
import { mailTo } from "./helpers";

const DROPPED_B = /^\[email\] Dropped an invalid message b: /;

afterEach(() => {
  vi.restoreAllMocks();
});

function message(id: string, body: unknown) {
  return { attempts: 1, body, id, timestamp: new Date() };
}

/** A valid `EMAIL_QUEUE` message: the welcome email, keyed. */
function welcomeBody(to: string) {
  return {
    id: crypto.randomUUID(),
    idempotencyKey: `welcome:${crypto.randomUUID()}`,
    locale: "nl",
    props: { name: "Alex", url: "http://localhost:5173" },
    template: "transactional/welcome",
    to,
  };
}

describe("the queue dispatch", () => {
  it("names each queue by its suffix, whatever the env", () => {
    expect(queueKind("smog-dev-email")).toBe("email");
    expect(queueKind("smog-production-email")).toBe("email");
    expect(queueKind("smog-staging-sponsorship-events")).toBe("events");
    expect(queueKind("smog-staging-email-dlq")).toBeNull();
    expect(queueKind("smog-staging-sponsorship-events-dlq")).toBeNull();
    expect(queueKind("someone-else")).toBeNull();
  });

  it("hands the email queue's batch to the email consumer", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const to = `${crypto.randomUUID()}@smog.test`;
    const batch = createMessageBatch("smog-dev-email", [
      message("a", welcomeBody(to)),
      message("b", { n: 2 }),
    ]);
    const ctx = createExecutionContext();

    await worker.queue(batch, env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks.sort()).toEqual(["a", "b"]);
    expect(result.retryMessages).toEqual([]);
    expect((await mailTo(to)).map((mail) => mail.subject)).toEqual([
      "Welkom bij SMOG & Co",
    ]);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(DROPPED_B));
  });

  it("hands the events queue's batch to the events consumer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const batch = createMessageBatch("smog-dev-sponsorship-events", [
      message("e", { paymentId: "p-1", type: "payment.settled" }),
      message("f", { nope: true }),
    ]);
    const ctx = createExecutionContext();

    await worker.queue(batch, env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks.sort()).toEqual(["e", "f"]);
    expect(warn).toHaveBeenCalledWith(
      "[sponsorships] payment.settled for p-1, which is unknown: nothing to do"
    );
  });

  it("logs and acks a batch from a queue it does not know", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const batch = createMessageBatch("smog-dev-email-dlq", [message("x", {})]);
    const ctx = createExecutionContext();

    await worker.queue(batch, env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.ackAll).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "[worker] Acked 1 message(s) from an unknown queue smog-dev-email-dlq"
    );
  });
});

describe("the email consumer (worker/email-queue.ts)", () => {
  async function run(id: string, body: unknown, attempts = 1) {
    const batch = createMessageBatch("smog-dev-email", [
      { attempts, body, id, timestamp: new Date() },
    ]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env, ctx);
    return await getQueueResult(batch, ctx);
  }

  it("sends a keyed message once when it is delivered twice", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const to = `${crypto.randomUUID()}@smog.test`;
    const body = welcomeBody(to);

    const first = await run("w-1", body);
    const second = await run("w-2", body, 2);

    expect(first.explicitAcks).toEqual(["w-1"]);
    expect(second.explicitAcks).toEqual(["w-2"]);
    expect(await mailTo(to)).toHaveLength(1);
  });

  it("retries a failed send with the backoff delay", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    if (!env.KV) {
      throw new Error("[test] The KV binding is missing");
    }
    vi.spyOn(env.KV, "put").mockRejectedValue(new Error("KV down"));
    const to = `${crypto.randomUUID()}@smog.test`;

    const batch = createMessageBatch("smog-dev-email", [
      { attempts: 3, body: welcomeBody(to), id: "r-1", timestamp: new Date() },
    ]);
    const [queued] = batch.messages;
    const retry = vi.spyOn(queued as Message, "retry");
    const ctx = createExecutionContext();

    await worker.queue(batch, env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks).toEqual([]);
    expect(result.retryMessages).toEqual([{ msgId: "r-1" }]);
    // min(30 × 2^(3 − 1), 3600)
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 120 });
  });
});

describe("the bindings of env.dev", () => {
  it("has both queue producers and the media bucket", () => {
    expect(typeof env.EMAIL_QUEUE?.send).toBe("function");
    expect(typeof env.EVENTS_QUEUE?.send).toBe("function");
    expect(typeof env.MEDIA?.head).toBe("function");
    expect(env.RENDER_MODE).toBe("fake");
    expect(env.MEDIA_BUCKET).toBe("smog-dev-media");
  });
});
