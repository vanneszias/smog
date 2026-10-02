import { describe, expect, test } from "bun:test";
import { AnalyticsProvider } from "@smog/analytics/react";
import { createRecordingAnalytics } from "@smog/analytics/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { COURSE_PROGRESS_KEY, type CourseStorage } from "./course-banner";
import { useVideoEnd } from "./video-end";

describe("useVideoEnd", () => {
  test("one onNearEnd for both apps: the event and the course count, once per visit", async () => {
    const map = new Map([[COURSE_PROGRESS_KEY, "6"]]);
    const storage: CourseStorage = {
      getItem: (key) => Promise.resolve(map.get(key) ?? null),
      setItem: (key, value) => {
        map.set(key, value);
        return Promise.resolve();
      },
    };
    const recorder = createRecordingAnalytics();
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <AnalyticsProvider analytics={recorder.analytics}>
          {children}
        </AnalyticsProvider>
      );
    }
    const { result } = renderHook(
      () => useVideoEnd({ gestureId: "g1", messageCount: 7, storage }),
      { wrapper }
    );
    await act(async () => {
      result.current.onNearEnd();
      result.current.onNearEnd();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(result.current.banner.messageIndex).not.toBeNull()
    );
    expect(map.get(COURSE_PROGRESS_KEY)).toBe("0");
    expect(recorder.events).toEqual([
      { name: "video_playback_completed", properties: { gesture_id: "g1" } },
    ]);
  });
});
