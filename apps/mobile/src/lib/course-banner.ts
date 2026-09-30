import AsyncStorage from "@react-native-async-storage/async-storage";
import { VIDEO_COMPLETE_COUNT } from "@smog/config/constants";
import { COURSE_MESSAGE_COUNT, type CourseMessageIndex } from "@smog/ui-native";
import { useCallback, useState } from "react";

/** The device's completed-video counter (not user data: it never syncs). */
export const COURSE_PROGRESS_KEY = "smog:course-progress:v1";

interface CourseStorage {
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

/** The counter over a storage (AsyncStorage in the app, a Map in tests). */
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

const deviceProgress = createCourseProgress(AsyncStorage);

function randomMessage(): CourseMessageIndex {
  return (Math.floor(Math.random() * COURSE_MESSAGE_COUNT) +
    1) as CourseMessageIndex;
}

export interface CourseBannerState {
  dismiss: () => void;
  /** The message to show, or `null` while the banner is hidden. */
  messageIndex: CourseMessageIndex | null;
  /** The video's `onNearEnd`: one completed playthrough. */
  onVideoComplete: () => void;
}

/**
 * The CourseBanner under a gesture video: it shows after every
 * `VIDEO_COMPLETE_COUNT` (7) completed videos on this device, with one of
 * the course messages, until dismissed.
 */
export function useCourseBanner(
  progress: CourseProgress = deviceProgress
): CourseBannerState {
  const [messageIndex, setMessageIndex] = useState<CourseMessageIndex | null>(
    null
  );
  const onVideoComplete = useCallback(() => {
    progress
      .complete()
      .then((due) => {
        if (due) {
          setMessageIndex(randomMessage());
        }
      })
      .catch((error: unknown) => {
        console.error("[courseBanner] Failed to count a video:", error);
      });
  }, [progress]);
  const dismiss = useCallback(() => setMessageIndex(null), []);
  return { dismiss, messageIndex, onVideoComplete };
}
