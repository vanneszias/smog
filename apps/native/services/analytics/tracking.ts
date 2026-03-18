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

/**
 * Identify the current user in PostHog.
 *
 * @param distinctId - Unique identifier for the user.
 * @param properties - Optional user properties to set.
 */
export function identifyUser(
  distinctId: string,
  properties?: AnalyticsProperties
): void {
  if (!getIsAnalyticsEnabled()) {
    return;
  }
  posthogInstance.identify(distinctId, buildEventProperties(properties));
}

/** Get the PostHog distinct ID for the current device/user. */
export async function getDistinctId(): Promise<string> {
  return posthogInstance.getDistinctId();
}

/** Flush all queued events to PostHog immediately. */
export function flushAnalytics(): Promise<void> {
  return posthogInstance.flush();
}

// ─── Screen navigation ────────────────────────────────────────────────────────

/** Track a screen view (for manual screen tracking, e.g. modals). */
export function trackScreenView(
  screenName: string,
  properties?: Record<string, unknown>
): void {
  if (!getIsAnalyticsEnabled()) {
    return;
  }
  posthogInstance.screen(screenName, {
    platform: "native",
    screen_name: screenName,
    ...properties,
  });
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

/** Track a video playback error. */
export function trackVideoError(
  gestureId: string,
  gestureName: string,
  errorType: string,
  errorMessage: string
): void {
  trackEvent("Video Error", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    error_type: errorType,
    error_message: errorMessage,
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

/** Track an undo action on a favorites operation. */
export function trackFavoriteUndoAction(
  gestureId: string,
  gestureName: string,
  action: "undo_add" | "undo_remove"
): void {
  trackEvent("Favorite Undo Action", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    undo_action: action,
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

// ─── Settings events ──────────────────────────────────────────────────────────

/** Track a settings option being selected. */
export function trackSettingsOptionSelected(option: string): void {
  trackEvent("Settings Option Selected", { setting_option: option });
}

/** Track the app theme being changed. */
export function trackThemeChanged(
  newTheme: string,
  previousTheme: string
): void {
  trackEvent("Theme Changed", {
    new_theme: newTheme,
    previous_theme: previousTheme,
  });
}

/** Track the app language being changed. */
export function trackLanguageChanged(
  newLanguage: string,
  previousLanguage: string
): void {
  trackEvent("Language Changed", {
    new_language: newLanguage,
    previous_language: previousLanguage,
  });
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

// ─── Performance events ───────────────────────────────────────────────────────

/** Track search performance metrics. */
export function trackSearchPerformance(
  query: string,
  durationMs: number,
  resultsCount: number
): void {
  trackEvent("Search Performance", {
    query_length: query.length,
    search_duration_ms: durationMs,
    results_count: resultsCount,
    performance_category:
      durationMs < 500 ? "fast" : durationMs < 1000 ? "medium" : "slow",
  });
}

/** Track pagination / load-more being triggered. */
export function trackLoadMoreResults(
  currentResultsCount: number,
  newResultsCount: number
): void {
  trackEvent("Load More Results", {
    current_results_count: currentResultsCount,
    new_results_count: newResultsCount,
    results_added: newResultsCount - currentResultsCount,
  });
}

// ─── Error tracking ───────────────────────────────────────────────────────────

/** Track a general application error. */
export function trackError(
  errorType: string,
  errorMessage: string,
  context?: Record<string, unknown>
): void {
  trackEvent("Error Occurred", {
    error_type: errorType,
    error_message: errorMessage,
    ...context,
  });
}

// ─── Engagement events ────────────────────────────────────────────────────────

/** Track an end-of-session engagement summary. */
export function trackUserEngagement(
  sessionDuration: number,
  gesturesViewed: number,
  searchesPerformed: number,
  favoritesAdded: number
): void {
  trackEvent("User Engagement Summary", {
    session_duration_minutes: Math.round(sessionDuration / 60),
    gestures_viewed: gesturesViewed,
    searches_performed: searchesPerformed,
    favorites_added: favoritesAdded,
    engagement_score:
      gesturesViewed * 2 + searchesPerformed * 1 + favoritesAdded * 3,
  });
}

/** Track usage of a specific feature. */
export function trackFeatureUsage(feature: string, usageCount: number): void {
  trackEvent("Feature Usage", {
    feature_name: feature,
    usage_count: usageCount,
    is_power_user: usageCount >= 10,
  });
}

// ─── Gesture learning events ──────────────────────────────────────────────────

/** Track a focused gesture learning session. */
export function trackGestureLearningSession(
  gestureId: string,
  gestureName: string,
  categories: string[],
  timeSpentSeconds: number,
  videoLoopCount: number,
  practicingIntention: boolean
): void {
  trackEvent("Gesture Learning Session", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    time_spent_seconds: timeSpentSeconds,
    video_loop_count: videoLoopCount,
    practicing_intention: practicingIntention,
    learning_intensity:
      timeSpentSeconds > 60 ? "high" : timeSpentSeconds > 30 ? "medium" : "low",
  });
}

/** Track deliberate repetition practice for a gesture. */
export function trackGestureRepetitionPractice(
  gestureId: string,
  gestureName: string,
  repetitionCount: number,
  sessionDurationSeconds: number
): void {
  trackEvent("Gesture Repetition Practice", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    repetition_count: repetitionCount,
    session_duration_seconds: sessionDurationSeconds,
    practice_effectiveness:
      repetitionCount > 10 ? "high" : repetitionCount > 5 ? "medium" : "low",
  });
}

/** Track progress through a category's gesture set. */
export function trackCategoryLearningProgress(
  category: string,
  gesturesViewedInCategory: number,
  gesturesFavoritedInCategory: number,
  totalGesturesInCategory: number
): void {
  trackEvent("Category Learning Progress", {
    category,
    gestures_viewed: gesturesViewedInCategory,
    gestures_favorited: gesturesFavoritedInCategory,
    total_gestures: totalGesturesInCategory,
    category_completion_percentage: Math.round(
      (gesturesViewedInCategory / totalGesturesInCategory) * 100
    ),
    category_mastery_percentage: Math.round(
      (gesturesFavoritedInCategory / totalGesturesInCategory) * 100
    ),
  });
}

/** Track a cross-category exploration pathway. */
export function trackLearningPathway(
  startCategory: string,
  endCategory: string,
  gesturesExplored: number,
  timeSpentMinutes: number
): void {
  trackEvent("Learning Pathway", {
    start_category: startCategory,
    end_category: endCategory,
    gestures_explored: gesturesExplored,
    time_spent_minutes: timeSpentMinutes,
    learning_flow_type:
      startCategory === endCategory ? "focused" : "exploratory",
  });
}

/** Track a self-assessed confidence level for a gesture. */
export function trackGestureConfidenceLevel(
  gestureId: string,
  gestureName: string,
  categories: string[],
  confidenceLevel: "beginner" | "intermediate" | "advanced",
  viewCount: number,
  favoriteStatus: boolean
): void {
  trackEvent("Gesture Confidence Assessment", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    confidence_level: confidenceLevel,
    view_count: viewCount,
    is_favorited: favoriteStatus,
    engagement_score: viewCount * (favoriteStatus ? 2 : 1),
  });
}

/** Track progress toward a learning goal. */
export function trackLearningGoalProgress(
  goalType: "daily_gestures" | "category_completion" | "favorite_count",
  currentProgress: number,
  targetGoal: number,
  timeFrameDays: number
): void {
  trackEvent("Learning Goal Progress", {
    goal_type: goalType,
    current_progress: currentProgress,
    target_goal: targetGoal,
    time_frame_days: timeFrameDays,
    completion_percentage: Math.round((currentProgress / targetGoal) * 100),
    on_track:
      currentProgress >=
      (targetGoal / timeFrameDays) * Math.min(timeFrameDays, 1),
  });
}

/** Track how a gesture was discovered. */
export function trackGestureDiscovery(
  gestureId: string,
  gestureName: string,
  categories: string[],
  discoveryMethod:
    | "search"
    | "category_browse"
    | "related_gesture"
    | "featured",
  searchQuery?: string
): void {
  trackEvent("Gesture Discovery", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    discovery_method: discoveryMethod,
    search_query: searchQuery,
    is_targeted_discovery: !!searchQuery,
  });
}

/** Track a daily learning streak update. */
export function trackLearningStreakUpdate(
  currentStreak: number,
  longestStreak: number,
  streakType: "daily_app_usage" | "daily_new_gestures" | "daily_practice",
  streakBroken: boolean
): void {
  trackEvent("Learning Streak Update", {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    streak_type: streakType,
    streak_broken: streakBroken,
    streak_momentum:
      currentStreak >= 7
        ? "strong"
        : currentStreak >= 3
          ? "building"
          : "starting",
  });
}

/** Track comprehension signals for a gesture (watched to end, repeated, favourited, etc.). */
export function trackGestureComprehension(
  gestureId: string,
  gestureName: string,
  categories: string[],
  comprehensionIndicators: {
    watchedToCompletion: boolean;
    repeatedViewing: boolean;
    addedToFavorites: boolean;
    exploredRelated: boolean;
  }
): void {
  const comprehensionScore = Object.values(comprehensionIndicators).filter(
    Boolean
  ).length;

  trackEvent("Gesture Comprehension Analysis", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    watched_to_completion: comprehensionIndicators.watchedToCompletion,
    repeated_viewing: comprehensionIndicators.repeatedViewing,
    added_to_favorites: comprehensionIndicators.addedToFavorites,
    explored_related: comprehensionIndicators.exploredRelated,
    comprehension_score: comprehensionScore,
    comprehension_level:
      comprehensionScore >= 3
        ? "high"
        : comprehensionScore >= 2
          ? "medium"
          : "low",
  });
}

/** Track overall session learning effectiveness. */
export function trackLearningEffectiveness(sessionMetrics: {
  sessionDurationMinutes: number;
  uniqueGesturesViewed: number;
  gesturesAddedToFavorites: number;
  categoriesExplored: string[];
  searchesPerformed: number;
  videoCompletionRate: number;
}): void {
  const effectivenessScore =
    sessionMetrics.uniqueGesturesViewed * 2 +
    sessionMetrics.gesturesAddedToFavorites * 3 +
    sessionMetrics.categoriesExplored.length * 1 +
    sessionMetrics.videoCompletionRate * 5;

  trackEvent("Learning Effectiveness Analysis", {
    session_duration_minutes: sessionMetrics.sessionDurationMinutes,
    unique_gestures_viewed: sessionMetrics.uniqueGesturesViewed,
    gestures_favorited: sessionMetrics.gesturesAddedToFavorites,
    categories_explored: sessionMetrics.categoriesExplored,
    categories_count: sessionMetrics.categoriesExplored.length,
    searches_performed: sessionMetrics.searchesPerformed,
    video_completion_rate: sessionMetrics.videoCompletionRate,
    effectiveness_score: effectivenessScore,
    learning_efficiency:
      effectivenessScore > 20
        ? "high"
        : effectivenessScore > 10
          ? "medium"
          : "low",
    gestures_per_minute:
      sessionMetrics.sessionDurationMinutes > 0
        ? Math.round(
            (sessionMetrics.uniqueGesturesViewed /
              sessionMetrics.sessionDurationMinutes) *
              100
          ) / 100
        : 0,
  });
}
