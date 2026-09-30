import { useAnalytics } from "@smog/analytics/react";
import {
  GESTURE_VIEW_SOURCES,
  type GestureViewSource,
} from "@smog/analytics/schema";
import { useCallback, useEffect, useRef } from "react";

/**
 * Where a gesture was opened from, read from a `from` route or search
 * param: a known source, else `direct` (a deep link, a typed URL, or an
 * unknown value). The value is enum-checked, so the worst case is a
 * mislabelled source.
 */
export function gestureViewSource(from: unknown): GestureViewSource {
  return (GESTURE_VIEW_SOURCES as readonly unknown[]).includes(from)
    ? (from as GestureViewSource)
    : "direct";
}

/** `gesture_viewed` once per gesture shown, when its id is known. */
export function useGestureViewed(
  gestureId: string | undefined,
  source: GestureViewSource
): void {
  const analytics = useAnalytics();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (gestureId === undefined || sent.current === gestureId) {
      return;
    }
    sent.current = gestureId;
    analytics.track({
      name: "gesture_viewed",
      properties: { gesture_id: gestureId, source },
    });
  }, [analytics, gestureId, source]);
}

/**
 * The video's `onNearEnd`: `video_playback_completed` once per visit. The
 * player loops (and a looping video never fires `ended`), so later loops
 * are ignored until the gesture changes or the screen mounts again.
 */
export function useVideoCompleted(gestureId: string): () => void {
  const analytics = useAnalytics();
  const sent = useRef<string | null>(null);
  return useCallback(() => {
    if (sent.current === gestureId) {
      return;
    }
    sent.current = gestureId;
    analytics.track({
      name: "video_playback_completed",
      properties: { gesture_id: gestureId },
    });
  }, [analytics, gestureId]);
}
