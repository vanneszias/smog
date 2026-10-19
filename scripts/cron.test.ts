import { describe, expect, test } from "bun:test";
import { cronUrl, parseCronArgs, triggerCron } from "./cron";

describe("bun run cron", () => {
  test("names a cron of CRON and defaults to the local dev server", () => {
    expect(parseCronArgs(["retention"])).toEqual({
      name: "retention",
      url: "http://localhost:5173",
    });
    expect(parseCronArgs(["stale", "--url", "http://localhost:4173/"])).toEqual(
      {
        name: "stale",
        url: "http://localhost:4173",
      }
    );
    expect(() => parseCronArgs([])).toThrow(
      "expiry, reminders, retention, stale"
    );
    expect(() => parseCronArgs(["monthly"])).toThrow("monthly");
  });

  test("calls Miniflare's scheduled trigger with the schedule (the current /cdn-cgi/local path)", () => {
    expect(cronUrl("http://localhost:5173", "retention")).toBe(
      "http://localhost:5173/cdn-cgi/local/scheduled?cron=15+3+*+*+*"
    );
    expect(cronUrl("http://localhost:5173", "stale")).toBe(
      "http://localhost:5173/cdn-cgi/local/scheduled?cron=0+*+*+*+*"
    );
  });

  test("refuses a non-local server", () => {
    expect(() =>
      parseCronArgs(["expiry", "--url", "https://smog.example"])
    ).toThrow("local");
  });

  test("fails when the dev server does not answer 2xx", async () => {
    const calls: string[] = [];
    const fetcher = (url: string) => {
      calls.push(url);
      return Promise.resolve(new Response("nope", { status: 404 }));
    };
    await expect(
      triggerCron({ name: "expiry", url: "http://localhost:5173" }, fetcher)
    ).rejects.toThrow("404");
    const ok = (url: string) => {
      calls.push(url);
      return Promise.resolve(new Response("ok"));
    };
    await triggerCron({ name: "expiry", url: "http://localhost:5173" }, ok);
    expect(calls).toHaveLength(2);
  });
});
