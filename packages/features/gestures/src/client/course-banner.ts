import { VIDEO_COMPLETE_COUNT } from "@smog/config/constants";
import { useCallback, useRef, useState } from "react";

/**
 * The device's completed-video counter. Device UI state, not guest data:
 * it never syncs, is not imported and survives the import reset. The key
 * is the one the app used before the rule moved here, so counts carry over.
 */
export const COURSE_PROGRESS_KEY = "smog:course-progress:v1";

/**
 * Where the counter lives: the local-store adapters fit (`webAdapter` from
 * `@smog/local-store/web`, `nativeAdapter` from `@smog/local-store/native`).
 */
export interface CourseStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export interface CourseProgress {
  /**
   * Counts a completed video; `true` when it is the `VIDEO_COMPLETE_COUNT`th
   * since the banner was last due (the counter then starts again).
   */
  complete: () => Promise<boolean>;
}

function parseCount(stored: string | null): number {
  const count = Number(stored);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

/** The counter over a storage. Completions run one after another. */
export function createCourseProgress(storage: CourseStorage): CourseProgress {
  let queue: Promise<unknown> = Promise.resolve();
  const complete = async (): Promise<boolean> => {
    const count = parseCount(await storage.getItem(COURSE_PROGRESS_KEY)) + 1;
    const due = count >= VIDEO_COMPLETE_COUNT;
    await storage.setItem(COURSE_PROGRESS_KEY, String(due ? 0 : count));
    return due;
  };
  return {
    // One after another, so two quick completions both count.
    complete: () => {
      const next = queue.then(complete);
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

/** One counter (one queue) per storage, shared by every screen. */
const progressByStorage = new WeakMap<CourseStorage, CourseProgress>();

function progressFor(storage: CourseStorage): CourseProgress {
  let progress = progressByStorage.get(storage);
  if (!progress) {
    progress = createCourseProgress(storage);
    progressByStorage.set(storage, progress);
  }
  return progress;
}

export interface UseCourseBannerOptions {
  /** The gesture on screen: one visit counts one video. */
  gestureId: string;
  /** How many course messages the kit has (`COURSE_MESSAGE_COUNT`). */
  messageCount: number;
  /** Picks the message (tests); `Math.random` by default. */
  random?: () => number;
  storage: CourseStorage;
}

export interface CourseBannerState<Index extends number = number> {
  dismiss: () => void;
  /** The message to show (1..messageCount), or `null` while hidden. */
  messageIndex: Index | null;
  /** The video's `onNearEnd`. Only the first call of a visit counts. */
  onVideoComplete: () => void;
}

interface Shown {
  gestureId: string;
  index: number;
}

/**
 * The CourseBanner rule (inventory L-13, bug 21), the one both apps use:
 * after every `VIDEO_COMPLETE_COUNT` (7) videos watched to the end on this
 * device, the banner shows one of the course messages under the video,
 * until dismissed. A visit counts once: the player loops, and its near-end
 * callback comes round every loop, so repeats are ignored until the
 * gesture changes or the screen mounts again. The banner belongs to the
 * gesture it was earned on.
 */
export function useCourseBanner<Index extends number = number>({
  gestureId,
  messageCount,
  random = Math.random,
  storage,
}: UseCourseBannerOptions): CourseBannerState<Index> {
  const [shown, setShown] = useState<Shown | null>(null);
  const counted = useRef<string | null>(null);
  const onVideoComplete = useCallback(() => {
    if (counted.current === gestureId) {
      return;
    }
    counted.current = gestureId;
    progressFor(storage)
      .complete()
      .then((due) => {
        if (due) {
          const index = Math.min(
            messageCount,
            Math.floor(random() * messageCount) + 1
          );
          setShown({ gestureId, index });
        }
      })
      .catch((error: unknown) => {
        console.error("[courseBanner] Failed to count a video:", error);
      });
  }, [gestureId, messageCount, random, storage]);
  const dismiss = useCallback(() => setShown(null), []);
  const messageIndex =
    shown?.gestureId === gestureId ? (shown.index as Index) : null;
  return { dismiss, messageIndex, onVideoComplete };
}
