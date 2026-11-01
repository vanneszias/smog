import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { monitoringOptions } from "../../../../../apps/site/src/worker/monitoring";
import { ORIGIN } from "./helpers";

/*
 * Error monitoring of the Worker (docs/ERROR_MONITORING.md): the options
 * `withSentry` gets, and the browser tunnel through the whole Worker. The
 * tunnel's own rules are unit-tested in `bun/shared/site/server/monitoring.test.ts`.
 */

const DSN = "https://0123456789abcdef0123456789abcdef@errors.example/2";

describe("monitoringOptions", () => {
  it("is off without a DSN", () => {
    expect(monitoringOptions({ ENVIRONMENT: "production" })).toBeUndefined();
    expect(
      monitoringOptions({ ENVIRONMENT: "production", SENTRY_DSN: "" })
    ).toBeUndefined();
  });

  it("reports to the DSN with the env's sampling and no personal data", () => {
    const options = monitoringOptions({
      ENVIRONMENT: "production",
      SENTRY_DSN: DSN,
    });
    expect(options?.dsn).toBe(DSN);
    expect(options?.environment).toBe("production");
    expect(options?.tracesSampleRate).toBe(0.1);
    expect(options?.traceLifecycle).toBe("static");
    expect(options?.dataCollection).toEqual({
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: false, response: false },
      urlQueryParams: false,
      userInfo: false,
    });
    expect(options?.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "CaptureConsole" }),
        expect.objectContaining({ name: "CronTriggers" }),
      ])
    );
  });

  it("drops the top-level line and scrubs and tags the rest", () => {
    const beforeSend = monitoringOptions({
      ENVIRONMENT: "staging",
      SENTRY_DSN: DSN,
    })?.beforeSend;
    if (!beforeSend) {
      throw new Error("beforeSend is missing");
    }
    const hint = {};
    expect(
      beforeSend({ message: '[error] fetch {"id":"x"}', type: undefined }, hint)
    ).toBeNull();
    const event = beforeSend(
      {
        message: "[lessons] Failed to send to anna@example.test",
        request: { url: "https://smog.example/lists/abc?token=1" },
        type: undefined,
      },
      hint
    );
    expect(event).toMatchObject({
      message: "[lessons] Failed to send to [redacted]",
      request: { url: "https://smog.example/lists/:token" },
      tags: { feature: "lessons" },
    });
  });
});

describe("POST /api/monitoring", () => {
  it("drops everything while the env has no DSN", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/monitoring`, {
      body: `${JSON.stringify({ dsn: DSN })}\n{"type":"event"}\n{}\n`,
      headers: { origin: ORIGIN },
      method: "POST",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
