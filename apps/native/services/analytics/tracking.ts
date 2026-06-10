/**
 * @fileoverview Typed event-tracking functions for the SMOG analytics service.
 *
 * Every public function maps to a specific PostHog event with strongly-typed
 * parameters. Events are only sent when the user has consented to analytics.
 *
 * Events are grouped by feature area:
 * - Screen navigation
 * - Search
 * - Gesture interactions
 * - Video playback
 * - Favorites
 * - UI interactions
 * - Settings
 * - App lifecycle
 * - Performance
 * - Errors
 * - Engagement
 * - Gesture learning (domain-specific)
 */

import { posthogInstance } from "./config";
import { getIsAnalyticsEnabled } from "./consent";
import type { AnalyticsProperties, FilteredProperties } from "./types";

// ─── Internal helpers ─────────────────────────────────────────────────────────

const platformProperties = { platform: "native" as const };

/**
 * Remove `undefined` values and merge with base platform properties.
 * PostHog rejects properties with undefined values.
 */
function buildEventProperties(
  properties?: AnalyticsProperties
): FilteredProperties {
  const filtered: FilteredProperties = { ...platformProperties };

  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined) {
        filtered[key] = value as string | number | boolean | null | string[];
      }
    }
  }

  return filtered;
}

/**
 * Core event tracking function. All typed track functions delegate here.
 *
 * @param event - PostHog event name.
 * @param properties - Optional event properties.
 */
export function trackEvent(
  event: string,
  properties?: AnalyticsProperties
): void {
  if (!getIsAnalyticsEnabled()) {
    return;
  }
  posthogInstance.capture(event, buildEventProperties(properties));
}

// ─── Search events ────────────────────────────────────────────────────────────

/** Track a search query being submitted. */
export function trackSearchPerformed(
  query: string,
  categories: string[],
  resultsCount: number,
  searchDuration?: number
): void {
  trackEvent("Search Performed", {
    query,
    query_length: query.length,
    has_categories: categories.length > 0,
    categories,
    categories_count: categories.length,
    results_count: resultsCount,
    has_results: resultsCount > 0,
    search_duration_ms: searchDuration,
  });
}

/** Track the search input being cleared. */
export function trackSearchCleared(previousQuery?: string): void {
  trackEvent("Search Cleared", {
    had_previous_query: !!previousQuery,
    previous_query_length: previousQuery?.length ?? 0,
  });
}

/** Track a category being added to the search filter. */
export function trackSearchCategoryAdded(
  category: string,
  totalCategories: number
): void {
  trackEvent("Search Category Added", {
    category,
    total_categories_selected: totalCategories,
  });
}

/** Track a category being removed from the search filter. */
export function trackSearchCategoryRemoved(
  category: string,
  remainingCategories: number
): void {
  trackEvent("Search Category Removed", {
    category,
    remaining_categories: remainingCategories,
  });
}

/** Track a recent search being selected from the history list. */
export function trackRecentSearchSelected(
  query: string,
  position: number
): void {
  trackEvent("Recent Search Selected", {
    query,
    query_length: query.length,
    position_in_list: position,
  });
}

// ─── Gesture interaction events ───────────────────────────────────────────────

/** Track a gesture detail screen being opened. */
export function trackGestureViewed(
  gestureId: string,
  gestureName: string,
  categories: string[],
  viewSource: "search_results" | "favorites" | "related_gestures"
): void {
  trackEvent("Gesture Viewed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    view_source: viewSource,
  });
}

/** Track a gesture being liked/hearted. */
export function trackGestureLiked(
  gestureId: string,
  gestureName: string,
  categories: string[],
  interactionType: "button_tap" | "double_tap" | "undo"
): void {
  trackEvent("Gesture Liked", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    interaction_type: interactionType,
  });
}

/** Track a gesture being un-liked. */
export function trackGestureUnliked(
  gestureId: string,
  gestureName: string,
  categories: string[],
  interactionType: "button_tap" | "undo"
): void {
  trackEvent("Gesture Unliked", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    interaction_type: interactionType,
  });
}

// ─── Video player events ──────────────────────────────────────────────────────

/** Track the video player being opened. */
export function trackVideoPlayerOpened(
  gestureId: string,
  gestureName: string,
  autoplay: boolean
): void {
  trackEvent("Video Player Opened", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    autoplay_enabled: autoplay,
  });
}

/** Track video playback starting. */
export function trackVideoPlaybackStarted(
  gestureId: string,
  gestureName: string,
  trigger: "autoplay" | "manual_play"
): void {
  trackEvent("Video Playback Started", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    trigger,
  });
}

/** Track video playback being paused. */
export function trackVideoPlaybackPaused(
  gestureId: string,
  gestureName: string,
  watchTimeSeconds?: number
): void {
  trackEvent("Video Playback Paused", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    watch_time_seconds: watchTimeSeconds,
  });
}

/** Track video playback reaching the end. */
export function trackVideoPlaybackCompleted(
  gestureId: string,
  gestureName: string,
  watchTimeSeconds?: number,
  loopCount?: number
): void {
  trackEvent("Video Playback Completed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    watch_time_seconds: watchTimeSeconds,
    loop_count: loopCount,
  });
}

/** Track video playback reaching the 90% mark. */
export function trackVideoAlmostCompleted(
  gestureId: string,
  gestureName: string
): void {
  trackEvent("Video Almost Completed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
  });
}

// ─── Category events ──────────────────────────────────────────────────────────

/** Track a category chip being tapped. */
export function trackCategoryPressed(
  category: string,
  source: "gesture_detail" | "search_filter" | "category_browser"
): void {
  trackEvent("Category Pressed", { category, source });
}

// ─── Favorites events ─────────────────────────────────────────────────────────

/** Track a gesture being added to favorites. */
export function trackFavoriteAdded(
  gestureId: string,
  gestureName: string,
  categories: string[],
  source:
    | "gesture_detail"
    | "search_results"
    | "favorites_screen"
    | "related_gestures"
): void {
  trackEvent("Favorite Added", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    source,
  });
}

/** Track a gesture being removed from favorites. */
export function trackFavoriteRemoved(
  gestureId: string,
  gestureName: string,
  categories: string[],
  source:
    | "gesture_detail"
    | "search_results"
    | "favorites_screen"
    | "related_gestures"
): void {
  trackEvent("Favorite Removed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    source,
  });
}

// ─── UI interaction events ────────────────────────────────────────────────────

/** Track a bottom sheet being opened. */
export function trackBottomSheetOpened(
  sheetType: "options" | "category_selection" | "settings"
): void {
  trackEvent("Bottom Sheet Opened", { sheet_type: sheetType });
}

/** Track a bottom sheet being closed. */
export function trackBottomSheetClosed(
  sheetType: "options" | "category_selection" | "settings"
): void {
  trackEvent("Bottom Sheet Closed", { sheet_type: sheetType });
}

// ─── App lifecycle events ─────────────────────────────────────────────────────

/** Track the app being opened. */
export function trackAppOpened(
  isFirstLaunch: boolean,
  timeSinceLastOpen?: number
): void {
  trackEvent("App Opened", {
    is_first_launch: isFirstLaunch,
    time_since_last_open_minutes: timeSinceLastOpen,
  });
}

/** Track the app being sent to the background. */
export function trackAppBackgrounded(sessionDurationSeconds: number): void {
  trackEvent("App Backgrounded", {
    session_duration_seconds: sessionDurationSeconds,
  });
}
