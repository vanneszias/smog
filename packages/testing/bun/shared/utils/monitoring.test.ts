import { describe, expect, test } from "bun:test";
import {
  FILTERED,
  featureOf,
  monitoringRelease,
  type ScrubbableEvent,
  scrubMonitoringBreadcrumb,
  scrubMonitoringEvent,
  scrubTransactionName,
  tracesSampleRate,
} from "../../../../utils/src/monitoring";
import { redactUrl, redactUrlPath } from "../../../../utils/src/url";

/** Typed as any event, as the SDK hooks see it. */
function scrub(event: ScrubbableEvent): ScrubbableEvent {
  return scrubMonitoringEvent(event);
}

const TOKEN = "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9d";

describe("redactUrl", () => {
  test("keeps origin and path, drops query, fragment and userinfo", () => {
    expect(
      redactUrl(`https://user:pw@smog.example/sponsor/edit?x=1#token=${TOKEN}`)
    ).toBe("https://smog.example/sponsor/edit");
  });

  test("masks capability segments on the web and in the app", () => {
    expect(redactUrl(`https://smog.example/lists/${TOKEN}/edit`)).toBe(
      "https://smog.example/lists/:token/edit"
    );
    expect(redactUrl("/lists/short")).toBe("/lists/:token");
    expect(redactUrl(`smog://shared/${TOKEN}`)).toBe("smog:/shared/:token");
    expect(redactUrl("/api/auth/reset-password/abc?callbackURL=/")).toBe(
      "/api/auth/reset-password/:token"
    );
  });

  test("keeps slugs and UUIDs readable", () => {
    expect(
      redactUrl(
        "/gestures/goedemorgen-zeggen/7f0c5e1c-0d3a-4c1b-9f43-2b1e0a9d1c2e"
      )
    ).toBe("/gestures/goedemorgen-zeggen/7f0c5e1c-0d3a-4c1b-9f43-2b1e0a9d1c2e");
  });

  test("masks token-like segments anywhere", () => {
    expect(redactUrlPath(`/api/x/${TOKEN}`)).toBe("/api/x/:token");
  });
});

describe("scrubMonitoringEvent", () => {
  test("strips the request down to a redacted URL and safe headers", () => {
    const event = scrub({
      request: {
        cookies: { session: "abc" },
        data: { password: "hunter2" },
        headers: {
          authorization: "Bearer abc",
          cookie: "better-auth.session_token=abc",
          "user-agent": "Mozilla/5.0",
        },
        query_string: "token=abc",
        url: `https://smog.example/lists/${TOKEN}?code=1#token=2`,
      },
    });
    expect(event.request).toEqual({
      cookies: undefined,
      data: undefined,
      headers: { "user-agent": "Mozilla/5.0" },
      query_string: undefined,
      url: "https://smog.example/lists/:token",
    });
  });

  test("keeps only the user's id", () => {
    const event = scrub({
      user: { email: "anna@example.test", id: "u_1", ip_address: "1.2.3.4" },
    });
    expect(event.user).toEqual({ id: "u_1" });
  });

  test("redacts messages, exception values, extra and breadcrumbs", () => {
    const event = scrub({
      breadcrumbs: [
        {
          data: { url: `https://smog.example/lists/${TOKEN}?x=1` },
          message: "mail anna@example.test",
        },
      ],
      exception: {
        values: [{ value: `token=${TOKEN} for anna@example.test` }],
      },
      extra: {
        arguments: ["[lessons] Failed to export", "anna@example.test"],
        nested: { apiKey: "k", note: `Bearer ${TOKEN}` },
      },
      message: "send to anna@example.test failed",
    });
    const text = JSON.stringify(event);
    expect(text).not.toContain("anna@example.test");
    expect(text).not.toContain(TOKEN);
    expect(event.breadcrumbs?.[0]?.data?.url).toBe(
      "https://smog.example/lists/:token"
    );
    const nested = event.extra?.nested as Record<string, unknown> | undefined;
    expect(nested?.apiKey).toBe(FILTERED);
  });

  test("tags the feature of a project log line", () => {
    expect(
      scrub({
        extra: {
          arguments: ["[rpc:lessons.get] Failed to handle the request:"],
        },
      }).tags
    ).toEqual({ feature: "rpc:lessons.get" });
    expect(scrub({ message: "[maintenance] Failed to parse" }).tags).toEqual({
      feature: "maintenance",
    });
    expect(
      scrub({
        message: "[maintenance] Failed",
        tags: { feature: "own" },
      }).tags
    ).toEqual({ feature: "own" });
  });

  test("redacts transaction and span names that carry a path", () => {
    const event = scrub({
      spans: [
        {
          data: { "url.full": `https://x.example/lists/${TOKEN}?a=1` },
          description: `GET https://x.example/lists/${TOKEN}`,
        },
      ],
      transaction: `GET /lists/${TOKEN}`,
    });
    expect(event.transaction).toBe("GET /lists/:token");
    expect(event.spans?.[0]).toEqual({
      data: { "url.full": "https://x.example/lists/:token" },
      description: "GET https://x.example/lists/:token",
    });
  });
});

describe("helpers", () => {
  test("scrubTransactionName leaves route patterns and operations alone", () => {
    expect(scrubTransactionName("/gestures/$slug")).toBe("/gestures/$slug");
    expect(scrubTransactionName("Scheduled Cron 0 * * * *")).toBe(
      "Scheduled Cron 0 * * * *"
    );
  });

  test("scrubMonitoringBreadcrumb", () => {
    expect(
      scrubMonitoringBreadcrumb({
        data: { to: `/lists/${TOKEN}` },
        message: "anna@example.test",
      })
    ).toEqual({ data: { to: "/lists/:token" }, message: "[redacted]" });
  });

  test("featureOf", () => {
    expect(featureOf("[i18n] Failed to load")).toBe("i18n");
    expect(featureOf("no prefix")).toBeUndefined();
    expect(featureOf(42)).toBeUndefined();
  });

  test("release and sampling", () => {
    expect(monitoringRelease("worker", " abc123 ")).toBe("smog-worker@abc123");
    expect(monitoringRelease("web", "")).toBeUndefined();
    expect(tracesSampleRate("production")).toBe(0.1);
    expect(tracesSampleRate("staging")).toBe(1);
  });
});
