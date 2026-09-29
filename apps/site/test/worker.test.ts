import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  getQueueResult,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("worker entry", () => {
  it("acks every queue message and logs the queue name", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const batch = createMessageBatch("smog-email", [
      { attempts: 1, body: { n: 1 }, id: "a", timestamp: new Date() },
      { attempts: 1, body: { n: 2 }, id: "b", timestamp: new Date() },
    ]);
    const ctx = createExecutionContext();

    worker.queue(batch);

    const result = await getQueueResult(batch, ctx);
    expect(result.ackAll).toBe(true);
    expect(result.retryBatch.retry).toBe(false);
    expect(result.retryMessages).toEqual([]);
    expect(log).toHaveBeenCalledWith("[worker] queue smog-email");
  });

  it("logs the cron of a scheduled event", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const controller = createScheduledController({ cron: "0 3 * * *" });

    worker.scheduled(controller);

    expect(log).toHaveBeenCalledWith("[worker] scheduled 0 3 * * *");
  });
});
