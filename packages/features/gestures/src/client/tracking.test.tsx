import { afterEach, describe, expect, test } from "bun:test";
import { AnalyticsProvider } from "@smog/analytics/react";
import { createRecordingAnalytics } from "@smog/analytics/testing";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  gestureViewSource,
  useGestureViewed,
  useVideoCompleted,
} from "./tracking";

afterEach(() => {
  cleanup();
});

function setup() {
  const recorder = createRecordingAnalytics();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <AnalyticsProvider analytics={recorder.analytics}>
        {children}
      </AnalyticsProvider>
    );
  }
  return { events: recorder.events, wrapper };
}

describe("gestureViewSource", () => {
  test("keeps a known source and falls back to direct", () => {
    expect(gestureViewSource("favorites")).toBe("favorites");
    expect(gestureViewSource("search_results")).toBe("search_results");
    expect(gestureViewSource("related_gestures")).toBe("related_gestures");
    expect(gestureViewSource(undefined)).toBe("direct");
    expect(gestureViewSource("evil")).toBe("direct");
    expect(gestureViewSource(["favorites"])).toBe("direct");
  });
});

describe("useGestureViewed", () => {
  test("tracks once per gesture shown, when its id arrives", () => {
    const { events, wrapper } = setup();
    const { rerender } = renderHook(
      ({ id }: { id: string | undefined }) =>
        useGestureViewed(id, "search_results"),
      { initialProps: { id: undefined as string | undefined }, wrapper }
    );
    expect(events).toEqual([]);
    rerender({ id: "g1" });
    rerender({ id: "g1" });
    rerender({ id: "g2" });
    expect(events).toEqual([
      {
        name: "gesture_viewed",
        properties: { gesture_id: "g1", source: "search_results" },
      },
      {
        name: "gesture_viewed",
        properties: { gesture_id: "g2", source: "search_results" },
      },
    ]);
  });
});

describe("useVideoCompleted", () => {
  test("tracks once per visit, not per loop; a new gesture counts again", () => {
    const { events, wrapper } = setup();
    const { rerender, result } = renderHook(
      ({ id }: { id: string }) => useVideoCompleted(id),
      { initialProps: { id: "g1" }, wrapper }
    );
    result.current();
    result.current();
    result.current();
    rerender({ id: "g2" });
    result.current();
    expect(events).toEqual([
      { name: "video_playback_completed", properties: { gesture_id: "g1" } },
      { name: "video_playback_completed", properties: { gesture_id: "g2" } },
    ]);
  });
});
