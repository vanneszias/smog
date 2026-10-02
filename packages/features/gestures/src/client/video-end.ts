import { useCallback } from "react";
import {
  type CourseBannerState,
  type UseCourseBannerOptions,
  useCourseBanner,
} from "./course-banner";
import { useVideoCompleted } from "./tracking";

export interface VideoEnd<Index extends number = number> {
  /** The course banner to render under the video. */
  banner: Omit<CourseBannerState<Index>, "onVideoComplete">;
  /** The player's `onNearEnd`. */
  onNearEnd: () => void;
}

/**
 * The end of a gesture video, as both apps handle it: the player's
 * `onNearEnd` tracks `video_playback_completed` and counts the course
 * banner's video, each once per visit (the player loops).
 */
export function useVideoEnd<Index extends number = number>(
  options: UseCourseBannerOptions
): VideoEnd<Index> {
  const trackCompleted = useVideoCompleted(options.gestureId);
  const { dismiss, messageIndex, onVideoComplete } =
    useCourseBanner<Index>(options);
  const onNearEnd = useCallback(() => {
    trackCompleted();
    onVideoComplete();
  }, [onVideoComplete, trackCompleted]);
  return { banner: { dismiss, messageIndex }, onNearEnd };
}
