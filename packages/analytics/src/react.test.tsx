import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { type ReactNode, useCallback } from "react";
import {
  type Analytics,
  type AnalyticsTransport,
  createAnalytics,
} from "./gate";
import {
  AnalyticsProvider,
  createConsentSource,
  useAnalytics,
  useAnalyticsIdentity,
  useMarkSignInStarted,
  useScreenTracking,
  useSignInCompleted,
  useSyncConsent,
} from "./react";
import type { AnalyticsEvent } from "./schema";

afterEach(() => {
  cleanup();
  globalThis.sessionStorage?.clear();
});

function recording(allowed = true): {
  analytics: Analytics;
  calls: unknown[][];
} {
  const calls: unknown[][] = [];
  return {
    analytics: {
      identify: (userId) => calls.push(["identify", userId]),
      isAllowed: () => allowed,
      reset: () => calls.push(["reset"]),
      screen: (path) => calls.push(["screen", path]),
      track: (event: AnalyticsEvent) => calls.push(["track", event]),
    },
    calls,
  };
}

function wrapper(analytics: Analytics) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AnalyticsProvider analytics={analytics}>{children}</AnalyticsProvider>
    );
  };
}

describe("useAnalytics", () => {
  test("is a no-op without a provider", () => {
    const { result } = renderHook(() => useAnalytics());
    expect(() => {
      result.current.track({
        name: "video_playback_completed",
        properties: { gesture_id: "g" },
      });
      result.current.screen("/");
    }).not.toThrow();
  });

  test("returns the provided instance", () => {
    const { analytics } = recording();
    const { result } = renderHook(() => useAnalytics(), {
      wrapper: wrapper(analytics),
    });
    expect(result.current).toBe(analytics);
  });
});

describe("useScreenTracking", () => {
  test("sends a screen per path change, not per render", () => {
    const { analytics, calls } = recording();
    const { rerender } = renderHook(
      ({ path }: { path: string | null }) => useScreenTracking(path),
      {
        initialProps: { path: null as string | null },
        wrapper: wrapper(analytics),
      }
    );
    rerender({ path: "/" });
    rerender({ path: "/" });
    rerender({ path: "/lists/$token" });
    expect(calls).toEqual([
      ["screen", "/"],
      ["screen", "/lists/$token"],
    ]);
  });
});

describe("useAnalyticsIdentity", () => {
  test("identifies a user and resets on sign-out", () => {
    const { analytics, calls } = recording();
    const { rerender } = renderHook(
      ({ userId }: { userId: string | null }) => useAnalyticsIdentity(userId),
      {
        initialProps: { userId: null as string | null },
        wrapper: wrapper(analytics),
      }
    );
    rerender({ userId: "user-1" });
    rerender({ userId: "user-1" });
    rerender({ userId: null });
    rerender({ userId: "user-2" });
    expect(calls).toEqual([
      ["identify", "user-1"],
      ["reset"],
      ["identify", "user-2"],
    ]);
  });
});

describe("useSignInCompleted", () => {
  test("tracks the marked method once the user is signed in", () => {
    const { analytics, calls } = recording();
    const { rerender, result } = renderHook(
      ({ userId }: { userId: string | null }) => {
        useSignInCompleted(userId);
        return useMarkSignInStarted();
      },
      {
        initialProps: { userId: null as string | null },
        wrapper: wrapper(analytics),
      }
    );
    result.current("passkey");
    rerender({ userId: "user-1" });
    rerender({ userId: "user-1" });
    expect(calls).toEqual([
      [
        "track",
        { name: "sign_in_completed", properties: { method: "passkey" } },
      ],
    ]);
  });

  test("an existing session without a mark tracks nothing", () => {
    const { analytics, calls } = recording();
    render(<Probe userId="user-1" />, { wrapper: wrapper(analytics) });
    expect(calls).toEqual([]);
  });

  test("with consent, the mark survives a full-page redirect (sessionStorage)", () => {
    const { analytics } = recording(true);
    const { result } = renderHook(() => useMarkSignInStarted(), {
      wrapper: wrapper(analytics),
    });
    result.current("google");
    expect(
      globalThis.sessionStorage.getItem("smog:analytics:sign-in")
    ).toContain("google");
  });
});

function Probe({ userId }: { userId: string | null }): null {
  useSignInCompleted(userId);
  return null;
}

describe("useMarkSignInStarted without consent", () => {
  test("keeps the mark in memory only: nothing is written to storage", () => {
    const { analytics, calls } = recording(false);
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) => {
        useSignInCompleted(userId);
        return useMarkSignInStarted();
      },
      {
        initialProps: { userId: null as string | null },
        wrapper: wrapper(analytics),
      }
    );
    result.current("emailCode");
    expect(
      globalThis.sessionStorage.getItem("smog:analytics:sign-in")
    ).toBeNull();
    rerender({ userId: "user-1" });
    expect(calls).toEqual([
      [
        "track",
        { name: "sign_in_completed", properties: { method: "emailCode" } },
      ],
    ]);
  });
});

describe("createConsentSource + useSyncConsent", () => {
  test("a hook's decision feeds the gate's getConsent / subscribe", () => {
    const source = createConsentSource();
    const seen: (boolean | null)[] = [];
    source.subscribe(() => seen.push(source.getConsent()));
    expect(source.getConsent()).toBeNull();
    const { rerender } = renderHook(
      ({ value }: { value: boolean | null }) => useSyncConsent(source, value),
      { initialProps: { value: null as boolean | null } }
    );
    act(() => rerender({ value: true }));
    act(() => rerender({ value: true }));
    act(() => rerender({ value: false }));
    expect(seen).toEqual([true, false]);
    expect(source.getConsent()).toBe(false);
  });
});

/** The apps' bridge order: the consent feed first, then identity and sign-in. */
function Bridge({
  consent,
  feed,
  userId,
}: {
  consent: boolean | null;
  feed: ReturnType<typeof createConsentSource>;
  userId: string | null;
}): null {
  useSyncConsent(feed, consent);
  useScreenTracking("/");
  useAnalyticsIdentity(userId);
  useSignInCompleted(userId);
  return null;
}

function gateHarness(platform: "web" | "native", initial: boolean | null) {
  const calls: unknown[][] = [];
  const transport: AnalyticsTransport = {
    identify: (id) => calls.push(["identify", id]),
    reset: () => calls.push(["reset"]),
    screen: (path) => calls.push(["screen", path]),
    track: (event) => calls.push(["track", event.name]),
  };
  const feed = createConsentSource(initial);
  const analytics = createAnalytics({
    getConsent: feed.getConsent,
    platform,
    subscribe: feed.subscribe,
    transport,
  });
  return { analytics, calls, feed };
}

describe("sign-in while useConsent loads (true, then null, then true)", () => {
  for (const platform of ["web", "native"] as const) {
    test(`${platform}: sign_in_completed is sent once, with no reset or repeat`, () => {
      const { analytics, calls, feed } = gateHarness(platform, true);
      function App({
        consent,
        userId,
      }: {
        consent: boolean | null;
        userId: string | null;
      }) {
        const mark = useMarkSignInStarted();
        const signIn = useCallback(() => mark("password"), [mark]);
        return (
          <>
            <Bridge consent={consent} feed={feed} userId={userId} />
            <button onClick={signIn} type="button">
              sign in
            </button>
          </>
        );
      }
      const view = render(
        <AnalyticsProvider analytics={analytics}>
          <App consent={true} userId={null} />
        </AnalyticsProvider>
      );
      act(() => view.getByRole("button").click());
      // Signed in: the user's consent query is pending.
      view.rerender(
        <AnalyticsProvider analytics={analytics}>
          <App consent={null} userId="user-1" />
        </AnalyticsProvider>
      );
      view.rerender(
        <AnalyticsProvider analytics={analytics}>
          <App consent={true} userId="user-1" />
        </AnalyticsProvider>
      );
      expect(calls).toEqual([
        ["screen", "/"],
        ["identify", "user-1"],
        ["track", "sign_in_completed"],
      ]);
    });
  }

  test("web OAuth redirect: a fresh page with the stored mark sends it on true", () => {
    // The page before the redirect stored the mark (with consent).
    globalThis.sessionStorage.setItem(
      "smog:analytics:sign-in",
      JSON.stringify({ at: Date.now(), method: "google" })
    );
    const { analytics, calls, feed } = gateHarness("web", null);
    const tree = (consent: boolean | null) => (
      <AnalyticsProvider analytics={analytics}>
        <Bridge consent={consent} feed={feed} userId="user-1" />
      </AnalyticsProvider>
    );
    const view = render(tree(null));
    expect(calls).toEqual([]);
    view.rerender(tree(true));
    expect(calls).toEqual([
      ["identify", "user-1"],
      ["screen", "/"],
      ["track", "sign_in_completed"],
    ]);
  });

  test("a loading consent that turns out false drops the sign-in", () => {
    globalThis.sessionStorage.setItem(
      "smog:analytics:sign-in",
      JSON.stringify({ at: Date.now(), method: "apple" })
    );
    const { analytics, calls, feed } = gateHarness("web", null);
    const tree = (consent: boolean | null) => (
      <AnalyticsProvider analytics={analytics}>
        <Bridge consent={consent} feed={feed} userId="user-1" />
      </AnalyticsProvider>
    );
    const view = render(tree(null));
    view.rerender(tree(false));
    view.rerender(tree(true));
    expect(calls.filter((call) => call[0] === "track")).toEqual([]);
  });
});
