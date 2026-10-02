import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  getQueueResult,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { CRON } from "@smog/jobs";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker";
import { queueKind } from "../src/worker/queues";

afterEach(() => {
  vi.restoreAllMocks();
});

function message(id: string, body: unknown) {
  return { attempts: 1, body, id, timestamp: new Date() };
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

  it("hands the email queue's batch to the email consumer (a stub that acks)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const batch = createMessageBatch("smog-dev-email", [
      message("a", { n: 1 }),
      message("b", { n: 2 }),
    ]);
    const ctx = createExecutionContext();

    await worker.queue(batch, env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks.sort()).toEqual(["a", "b"]);
    expect(result.retryMessages).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      "[email-queue] 2 message(s) acked (the consumer is phase 6 task 2)"
    );
  });

  it("hands the events queue's batch to the events consumer (a stub that acks)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const batch = createMessageBatch("smog-dev-sponsorship-events", [
      message("e", { paymentId: "p-1", type: "payment.settled" }),
    ]);
    const ctx = createExecutionContext();

    await worker.queue(batch, env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks).toEqual(["e"]);
    expect(log).toHaveBeenCalledWith(
      "[events-queue] 1 message(s) acked (the consumer is phase 6 task 4)"
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

describe("the scheduled dispatch", () => {
  it.each(Object.entries(CRON))(
    "routes %s (%s) to its handler (a stub that logs)",
    async (name, cron) => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const controller = createScheduledController({
        cron,
        scheduledTime: new Date("2026-10-02T08:00:00Z"),
      });
      const ctx = createExecutionContext();

      await worker.scheduled(controller, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(log).toHaveBeenCalledWith(
        `[cron] ${name} skipped (its handler is phase 6 task 5)`
      );
    }
  );

  it("logs a cron it does not know and does not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const controller = createScheduledController({ cron: "0 3 1 * *" });

    await worker.scheduled(controller, env, createExecutionContext());

    expect(warn).toHaveBeenCalledWith("[cron] Unknown schedule 0 3 1 * *");
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
