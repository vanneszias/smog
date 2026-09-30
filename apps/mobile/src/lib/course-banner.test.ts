import { describe, expect, it } from "@jest/globals";
import { VIDEO_COMPLETE_COUNT } from "@smog/config/constants";
import { COURSE_PROGRESS_KEY, createCourseProgress } from "./course-banner";

function memoryStorage(initial?: string): {
  getItem: (key: string) => Promise<string | null>;
  map: Map<string, string>;
  setItem: (key: string, value: string) => Promise<void>;
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

describe("the course banner counter", () => {
  it("is due on every seventh completed video", async () => {
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

  it("counts quick completions one after another", async () => {
    const storage = memoryStorage("5");
    const progress = createCourseProgress(storage);
    const due = await Promise.all([progress.complete(), progress.complete()]);
    expect(due).toEqual([false, true]);
    expect(storage.map.get(COURSE_PROGRESS_KEY)).toBe("0");
  });

  it("starts from zero when the stored value is not a count", async () => {
    const storage = memoryStorage("garbage");
    await createCourseProgress(storage).complete();
    expect(storage.map.get(COURSE_PROGRESS_KEY)).toBe("1");
  });
});
