import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Analytics } from "./gate";
import {
  AnalyticsProvider,
  markSignInStarted,
  useAnalytics,
  useAnalyticsIdentity,
  useScreenTracking,
  useSignInCompleted,
} from "./react";
import type { AnalyticsEvent } from "./schema";

afterEach(() => {
  cleanup();
  globalThis.sessionStorage?.clear();
});

function recording(): { analytics: Analytics; calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    analytics: {
      identify: (userId) => calls.push(["identify", userId]),
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
    const { rerender } = renderHook(
      ({ userId }: { userId: string | null }) => useSignInCompleted(userId),
      {
        initialProps: { userId: null as string | null },
        wrapper: wrapper(analytics),
      }
    );
    markSignInStarted("passkey");
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

  test("the mark survives a full-page redirect (sessionStorage)", () => {
    markSignInStarted("google");
    expect(
      globalThis.sessionStorage.getItem("smog:analytics:sign-in")
    ).toContain("google");
  });
});

function Probe({ userId }: { userId: string | null }): null {
  useSignInCompleted(userId);
  return null;
}
