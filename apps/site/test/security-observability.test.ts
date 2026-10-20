import { describe, expect, it, vi } from "vitest";
import { guardedQueue, guardedScheduled } from "../src/worker/top-level";

/*
 * Phase 9 task 8 (ruling 14): `queue` and `scheduled` get the same
 * top-level backstop `fetch` has in `respondSecurely`: one `[error]` line
 * with the name and a redacted message, then the error goes on (the queue
 * retries, the cron run shows as failed). No external error reporter.
 */

describe("the top-level queue and scheduled handlers", () => {
  it("logs an escaping queue error once, redacted, and rethrows it", async () => {
    const lines: string[] = [];
    const failure = new Error("send to anna@example.test failed");
    await expect(
      guardedQueue(
        () => Promise.reject(failure),
        "smog-staging-email",
        (line) => lines.push(line)
      )
    ).rejects.toBe(failure);
    expect(lines).toHaveLength(1);
    expect(
      lines[0]?.startsWith('[error] queue {"id":"smog-staging-email:')
    ).toBe(true);
    expect(lines[0]).toContain('"message":"send to [redacted] failed"');
    expect(lines[0]).toContain('"name":"Error"');
    expect(lines[0]).not.toContain("anna");
  });

  it("logs an escaping cron error once and rethrows it", async () => {
    const lines: string[] = [];
    const failure = new RangeError("d1 down");
    await expect(
      guardedScheduled(
        () => Promise.reject(failure),
        "0 3 * * *",
        (line) => lines.push(line)
      )
    ).rejects.toBe(failure);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.startsWith('[error] scheduled {"id":"0 3 * * *:')).toBe(
      true
    );
    expect(lines[0]).toContain('"name":"RangeError"');
  });

  it("logs nothing when the handler succeeds", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await guardedQueue(() => Promise.resolve(), "q");
    await guardedScheduled(() => Promise.resolve(), "* * * * *");
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
