import { describe, expect, mock, test } from "bun:test";
import {
  ANALYTICS_RELAY_PATH,
  createWebAnalytics,
  createWebTransport,
  webRouteTemplate,
} from "./web";

describe("webRouteTemplate", () => {
  test("keeps the template and drops a trailing slash", () => {
    expect(webRouteTemplate("/")).toBe("/");
    expect(webRouteTemplate("/lists/$token")).toBe("/lists/$token");
    expect(webRouteTemplate("/lists/")).toBe("/lists");
  });
});

function recorder() {
  const fetch = mock((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response(null, { status: 202 }))
  );
  const bodies = (): unknown[] =>
    fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
  return { bodies, fetch };
}

describe("createWebTransport", () => {
  test("POSTs track and identify to the same-origin relay with keepalive", async () => {
    const { bodies, fetch } = recorder();
    const transport = createWebTransport({
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await transport.track({
      name: "gesture_viewed",
      properties: { gesture_id: "g-1", platform: "web", source: "direct" },
    });
    await transport.identify("user-1", "web");
    await transport.screen("/", "web");
    expect(fetch).toHaveBeenCalledTimes(3);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ANALYTICS_RELAY_PATH);
    expect(ANALYTICS_RELAY_PATH).toBe("/api/analytics");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json"
    );
    expect(bodies()).toEqual([
      {
        payload: {
          name: "gesture_viewed",
          properties: { gesture_id: "g-1", platform: "web", source: "direct" },
        },
        type: "track",
      },
      {
        payload: {
          profileId: "user-1",
          properties: { auth_mode: "authenticated", platform: "web" },
        },
        type: "identify",
      },
      {
        payload: {
          name: "screen_view",
          profileId: "user-1",
          properties: { path: "/", platform: "web" },
        },
        type: "track",
      },
    ]);
  });

  test("reset drops the profile id from later events", async () => {
    const { bodies, fetch } = recorder();
    const transport = createWebTransport({
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await transport.identify("user-1", "web");
    transport.reset();
    await transport.screen("/", "web");
    expect(bodies().at(-1)).toEqual({
      payload: {
        name: "screen_view",
        properties: { path: "/", platform: "web" },
      },
      type: "track",
    });
  });

  test("a relay error rejects, for the gate to log", async () => {
    const transport = createWebTransport({
      fetch: (() =>
        Promise.resolve(
          new Response(null, { status: 429 })
        )) as unknown as typeof globalThis.fetch,
    });
    await expect(transport.screen("/", "web")).rejects.toThrow("429");
  });

  test("a network failure (offline, a navigation cut it off) is dropped, not an error", async () => {
    const warn = mock(() => undefined);
    const original = console.warn;
    console.warn = warn;
    try {
      const transport = createWebTransport({
        fetch: (() =>
          Promise.reject(
            new TypeError("Failed to fetch")
          )) as unknown as typeof globalThis.fetch,
      });
      await expect(transport.screen("/", "web")).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      console.warn = original;
    }
  });
});

describe("createWebAnalytics", () => {
  test("no request at all before consent", () => {
    const { fetch } = recorder();
    const analytics = createWebAnalytics({
      fetch: fetch as unknown as typeof globalThis.fetch,
      getConsent: () => null,
    });
    analytics.screen("/");
    analytics.identify("user-1");
    expect(fetch).not.toHaveBeenCalled();
  });
});
