import { afterEach, describe, expect, test } from "bun:test";
import { VIDEO_COMPLETE_COUNT } from "@smog/config/constants";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  COURSE_PROGRESS_KEY,
  type CourseStorage,
  createCourseProgress,
  useCourseBanner,
} from "./course-banner";

function memoryStorage(initial?: string): CourseStorage & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>(
    initial === undefined ? [] : [[COURSE_PROGRESS_KEY, initial]]
  );
  return {
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    map,
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

function options(storage: CourseStorage, gestureId: string) {
  return { gestureId, messageCount: 7, random: () => 0.5, storage };
}

afterEach(() => {
  cleanup();
});

describe("the course progress counter", () => {
  test("is due on every seventh completed video", async () => {
    expect(VIDEO_COMPLETE_COUNT).toBe(7);
    const progress = createCourseProgress(memoryStorage());
    const results: boolean[] = [];
    for (let video = 0; video < 14; video += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one video after another, as a viewer would
      results.push(await progress.complete());
    }
    expect(results.map((due, index) => (due ? index + 1 : 0))).toEqual([
      0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 14,
    ]);
  });

  test("counts quick completions one after another", async () => {
    const storage = memoryStorage("5");
    const progress = createCourseProgress(storage);
    const due = await Promise.all([progress.complete(), progress.complete()]);
    expect(due).toEqual([false, true]);
    expect(storage.map.get(COURSE_PROGRESS_KEY)).toBe("0");
  });

  test("starts from zero when the stored value is not a count", async () => {
    const storage = memoryStorage("garbage");
    await createCourseProgress(storage).complete();
    expect(storage.map.get(COURSE_PROGRESS_KEY)).toBe("1");
  });
});

describe("useCourseBanner", () => {
  test("counts one video per visit, however often it loops (bug 21)", async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() =>
      useCourseBanner(options(storage, "hond"))
    );
    await act(async () => {
      for (let loop = 0; loop < 10; loop += 1) {
        result.current.onVideoComplete();
      }
      await Promise.resolve();
    });
    await waitFor(() => expect(storage.map.get(COURSE_PROGRESS_KEY)).toBe("1"));
    expect(result.current.messageIndex).toBeNull();
  });

  test("a new gesture is a new visit; the seventh shows a message until dismissed", async () => {
    const storage = memoryStorage("5");
    const { rerender, result } = renderHook(
      ({ id }: { id: string }) => useCourseBanner(options(storage, id)),
      { initialProps: { id: "hond" } }
    );
    await act(async () => {
      result.current.onVideoComplete();
      await Promise.resolve();
    });
    await waitFor(() => expect(storage.map.get(COURSE_PROGRESS_KEY)).toBe("6"));
    expect(result.current.messageIndex).toBeNull();

    rerender({ id: "kat" });
    await act(async () => {
      result.current.onVideoComplete();
      result.current.onVideoComplete();
      await Promise.resolve();
    });
    // 0.5 × 7 messages → the fourth.
    await waitFor(() => expect(result.current.messageIndex).toBe(4));
    expect(storage.map.get(COURSE_PROGRESS_KEY)).toBe("0");

    act(() => result.current.dismiss());
    expect(result.current.messageIndex).toBeNull();
  });

  test("the banner belongs to its gesture: another one hides it", async () => {
    const storage = memoryStorage("6");
    const { rerender, result } = renderHook(
      ({ id }: { id: string }) => useCourseBanner(options(storage, id)),
      { initialProps: { id: "hond" } }
    );
    await act(async () => {
      result.current.onVideoComplete();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.messageIndex).toBe(4));
    rerender({ id: "kat" });
    expect(result.current.messageIndex).toBeNull();
  });

  test("a remount (a new visit to the same gesture) counts again", async () => {
    const storage = memoryStorage();
    const first = renderHook(() => useCourseBanner(options(storage, "hond")));
    await act(async () => {
      first.result.current.onVideoComplete();
      await Promise.resolve();
    });
    first.unmount();
    const second = renderHook(() => useCourseBanner(options(storage, "hond")));
    await act(async () => {
      second.result.current.onVideoComplete();
      await Promise.resolve();
    });
    await waitFor(() => expect(storage.map.get(COURSE_PROGRESS_KEY)).toBe("2"));
  });
});
