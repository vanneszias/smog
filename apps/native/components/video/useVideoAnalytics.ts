/**
 * @fileoverview Analytics tracking hook for video playback events.
 *
 * Extracts all PostHog event-tracking logic from `VideoPlayer` into a
 * dedicated hook so the component stays focused on rendering.
 *
 * @example
 * const analytics = useVideoAnalytics({ gestureId, gestureName, autoPlay });
 * analytics.onPlaybackStarted();
 * analytics.onPlaybackPaused(watchTimeSeconds);
 */

import { useRef } from "react";
import {
  trackVideoAlmostCompleted,
  trackVideoPlaybackCompleted,
  trackVideoPlaybackPaused,
  trackVideoPlaybackStarted,
  trackVideoPlayerOpened,
} from "@/services/analytics";

interface UseVideoAnalyticsOptions {
  gestureId?: string;
  gestureName?: string;
  autoPlay: boolean;
}

/**
 * Manages analytics event tracking for a VideoPlayer instance.
 *
 * Stores gestureId / gestureName in refs so that event callbacks always
 * read the latest prop values without being re-registered.
 *
 * @returns An object of analytics event callbacks.
 */
export function useVideoAnalytics({
  gestureId,
  gestureName,
  autoPlay,
}: UseVideoAnalyticsOptions) {
  // Refs so event callbacks never go stale
  const gestureIdRef = useRef(gestureId);
  const gestureNameRef = useRef(gestureName);
  const playbackStartTimeRef = useRef<number | null>(null);
  const hasTrackedOpenRef = useRef(false);

  // Keep refs in sync
  gestureIdRef.current = gestureId;
  gestureNameRef.current = gestureName;

  const onPlayerReady = () => {
    const gId = gestureIdRef.current;
    const gName = gestureNameRef.current;
    if (gId && gName && !hasTrackedOpenRef.current) {
      trackVideoPlayerOpened(gId, gName, autoPlay);
      hasTrackedOpenRef.current = true;
    }
  };

  const onPlaybackStarted = () => {
    const gId = gestureIdRef.current;
    const gName = gestureNameRef.current;
    if (gId && gName) {
      trackVideoPlaybackStarted(
        gId,
        gName,
        autoPlay ? "autoplay" : "manual_play"
      );
      playbackStartTimeRef.current = Date.now();
    }
  };

  const onPlaybackPaused = () => {
    const gId = gestureIdRef.current;
    const gName = gestureNameRef.current;
    if (gId && gName) {
      const watchTime = playbackStartTimeRef.current
        ? (Date.now() - playbackStartTimeRef.current) / 1000
        : undefined;
      trackVideoPlaybackPaused(gId, gName, watchTime);
    }
    playbackStartTimeRef.current = null;
  };

  const onPlaybackCompleted = () => {
    const gId = gestureIdRef.current;
    const gName = gestureNameRef.current;
    if (gId && gName) {
      const watchTime = playbackStartTimeRef.current
        ? (Date.now() - playbackStartTimeRef.current) / 1000
        : undefined;
      trackVideoPlaybackCompleted(gId, gName, watchTime);
    }
  };

  const onAlmostCompleted = () => {
    const gId = gestureIdRef.current;
    const gName = gestureNameRef.current;
    if (gId && gName) {
      trackVideoAlmostCompleted(gId, gName);
    }
  };

  return {
    onPlayerReady,
    onPlaybackStarted,
    onPlaybackPaused,
    onPlaybackCompleted,
    onAlmostCompleted,
  };
}
