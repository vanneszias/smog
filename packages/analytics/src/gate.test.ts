import { describe, expect, mock, spyOn, test } from "bun:test";
import { type AnalyticsTransport, createAnalytics } from "./gate";

interface Harness {
  calls: unknown[][];
  setConsent: (value: boolean | null) => void;
  transport: AnalyticsTransport;
}

function harness(initial: boolean | null = null): Harness & {
  consent: {
    get: () => boolean | null;
    subscribe: (l: () => void) => () => void;
  };
} {
  let value = initial;
  const listeners = new Set<() => void>();
  const calls: unknown[][] = [];
  const transport: AnalyticsTransport = {
    identify: (...args) => {
      calls.push(["identify", ...args]);
    },
    reset: () => {
      calls.push(["reset"]);
    },
    screen: (...args) => {
      calls.push(["screen", ...args]);
    },
    track: (...args) => {
      calls.push(["track", ...args]);
    },
  };
  return {
    calls,
    consent: {
      get: () => value,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    setConsent: (next) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    transport,
  };
}

const VIEWED = {
  name: "gesture_viewed",
  properties: { gesture_id: "g-1", source: "direct" },
} as const;

describe("createAnalytics", () => {
  test("sends nothing while consent is undecided or refused", () => {
    for (const initial of [null, false]) {
      const h = harness(initial);
      const analytics = createAnalytics({
        getConsent: h.consent.get,
        platform: "web",
        transport: h.transport,
      });
      analytics.track(VIEWED);
      analytics.identify("user-1");
      analytics.screen("/");
      expect(h.calls).toEqual([]);
    }
  });

  test("sends after consent, with the platform added", () => {
    const h = harness(null);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "native",
      subscribe: h.consent.subscribe,
      transport: h.transport,
    });
    analytics.track(VIEWED);
    h.setConsent(true);
    analytics.track(VIEWED);
    analytics.screen("/lists/$token");
    analytics.identify("user-1");
    expect(h.calls).toEqual([
      [
        "track",
        {
          name: "gesture_viewed",
          properties: {
            gesture_id: "g-1",
            platform: "native",
            source: "direct",
          },
        },
      ],
      ["screen", "/lists/$token", "native"],
      ["identify", "user-1", "native"],
    ]);
  });

  test("sends nothing after withdraw, and withdrawing clears the identity", () => {
    const h = harness(true);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "web",
      subscribe: h.consent.subscribe,
      transport: h.transport,
    });
    analytics.identify("user-1");
    h.setConsent(false);
    h.calls.length = 0;
    analytics.track(VIEWED);
    analytics.screen("/");
    analytics.identify("user-1");
    expect(h.calls).toEqual([]);
    // The reset ran on the withdraw itself.
    const again = harness(true);
    const second = createAnalytics({
      getConsent: again.consent.get,
      platform: "web",
      subscribe: again.consent.subscribe,
      transport: again.transport,
    });
    second.identify("user-1");
    again.setConsent(false);
    expect(again.calls.at(-1)).toEqual(["reset"]);
  });

  test("an identity set before consent is sent once consent is given", () => {
    const h = harness(null);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "web",
      subscribe: h.consent.subscribe,
      transport: h.transport,
    });
    analytics.identify("user-1");
    expect(h.calls).toEqual([]);
    h.setConsent(true);
    expect(h.calls).toEqual([["identify", "user-1", "web"]]);
  });

  test("the current screen is sent once consent is given (the page is still open)", () => {
    const h = harness(null);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "web",
      subscribe: h.consent.subscribe,
      transport: h.transport,
    });
    analytics.screen("/");
    analytics.screen("/lists");
    analytics.identify("user-1");
    expect(h.calls).toEqual([]);
    h.setConsent(true);
    expect(h.calls).toEqual([
      ["identify", "user-1", "web"],
      ["screen", "/lists", "web"],
    ]);
    // Withdraw and allow again: the screen is sent again, once.
    h.setConsent(false);
    h.setConsent(true);
    expect(h.calls.filter((call) => call[0] === "screen")).toHaveLength(2);
  });

  test("null (loading) only pauses: no reset, no second identify or screen on reopen", () => {
    const h = harness(true);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "web",
      subscribe: h.consent.subscribe,
      transport: h.transport,
    });
    analytics.identify("user-1");
    analytics.screen("/");
    h.setConsent(null);
    analytics.track(VIEWED);
    h.setConsent(true);
    expect(h.calls).toEqual([
      ["identify", "user-1", "web"],
      ["screen", "/", "web"],
    ]);
    // A screen changed during the pause is sent once on reopen.
    h.setConsent(null);
    analytics.screen("/lists");
    h.setConsent(true);
    expect(h.calls.at(-1)).toEqual(["screen", "/lists", "web"]);
    expect(h.calls).toHaveLength(3);
  });

  test("an explicit false after a pause resets", () => {
    const h = harness(true);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "web",
      subscribe: h.consent.subscribe,
      transport: h.transport,
    });
    analytics.identify("user-1");
    h.setConsent(null);
    h.setConsent(false);
    expect(h.calls.at(-1)).toEqual(["reset"]);
  });

  test("sign_in_completed during a pause is held: sent on true, dropped on false", () => {
    const signIn = {
      name: "sign_in_completed",
      properties: { method: "google" },
    } as const;
    for (const decided of [true, false]) {
      const h = harness(null);
      const analytics = createAnalytics({
        getConsent: h.consent.get,
        platform: "native",
        subscribe: h.consent.subscribe,
        transport: h.transport,
      });
      analytics.track(signIn);
      analytics.track(VIEWED);
      h.setConsent(decided);
      h.setConsent(true);
      const tracked = h.calls.filter((call) => call[0] === "track");
      expect(tracked).toEqual(
        decided
          ? [
              [
                "track",
                {
                  name: "sign_in_completed",
                  properties: { method: "google", platform: "native" },
                },
              ],
            ]
          : []
      );
    }
  });

  test("a refused consent never holds a sign_in_completed", () => {
    const h = harness(false);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "web",
      subscribe: h.consent.subscribe,
      transport: h.transport,
    });
    analytics.track({
      name: "sign_in_completed",
      properties: { method: "password" },
    });
    h.setConsent(true);
    expect(h.calls).toEqual([]);
  });

  test("reset forgets the identity, and is a no-op without consent", () => {
    const h = harness(true);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "web",
      transport: h.transport,
    });
    analytics.identify("user-1");
    analytics.reset();
    expect(h.calls).toEqual([["identify", "user-1", "web"], ["reset"]]);
    const off = harness(false);
    createAnalytics({
      getConsent: off.consent.get,
      platform: "web",
      transport: off.transport,
    }).reset();
    expect(off.calls).toEqual([]);
  });

  test("an invalid event is dropped and logged, never sent", () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const h = harness(true);
    const analytics = createAnalytics({
      getConsent: h.consent.get,
      platform: "web",
      transport: h.transport,
    });
    analytics.track({
      name: "search_performed",
      properties: {
        category_count: 0,
        has_results: false,
        query_length: -1,
        result_count: 0,
        source: "submit",
      },
    });
    analytics.screen("/search?q=secret");
    expect(h.calls).toEqual([]);
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toStartWith("[analytics]");
    error.mockRestore();
  });

  test("transport errors are logged with [analytics] and swallowed", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const analytics = createAnalytics({
      getConsent: () => true,
      platform: "web",
      transport: {
        identify: () => {
          throw new Error("boom");
        },
        reset: () => undefined,
        screen: () => undefined,
        track: mock(() => Promise.reject(new Error("offline"))),
      },
    });
    expect(() => analytics.track(VIEWED)).not.toThrow();
    expect(() => analytics.identify("user-1")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalledTimes(2);
    for (const call of error.mock.calls) {
      expect(String(call[0])).toStartWith("[analytics]");
    }
    error.mockRestore();
  });

  test("a throwing consent reader counts as no consent", () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const h = harness(true);
    const analytics = createAnalytics({
      getConsent: () => {
        throw new Error("storage blocked");
      },
      platform: "web",
      transport: h.transport,
    });
    analytics.track(VIEWED);
    expect(h.calls).toEqual([]);
    error.mockRestore();
  });
});
