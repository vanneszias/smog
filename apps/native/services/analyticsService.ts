import AsyncStorage from "@react-native-async-storage/async-storage";
import PostHog from "posthog-react-native";

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || "";
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let isAnalyticsEnabled = false;
let posthogInstance: PostHog | null = null;

// Initialize analytics based on user consent
export const initializeAnalytics = async () => {
  const consent = await AsyncStorage.getItem("@smog_analytics_consent");
  isAnalyticsEnabled = consent === "true";

  if (!isAnalyticsEnabled) {
    console.log("[Analytics] User opted out of analytics");
    return;
  }

  if (!posthogInstance) {
    posthogInstance = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false, // Disabled by default for privacy
    });
  }

  console.log("[Analytics] PostHog initialized");
};

// Enable analytics (called when user consents)
export const enableAnalytics = async () => {
  isAnalyticsEnabled = true;
  await AsyncStorage.setItem("@smog_analytics_consent", "true");
  await initializeAnalytics();
};

// Disable analytics (called when user opts out)
export const disableAnalytics = async () => {
  isAnalyticsEnabled = false;
  await AsyncStorage.setItem("@smog_analytics_consent", "false");

  if (posthogInstance) {
    posthogInstance.reset(); // Clear user identity
  }

  console.log("[Analytics] Analytics disabled");
};

// Get PostHog instance (null if not consented)
export const posthog = posthogInstance;

// Autocapture configuration for PostHogProvider
// Note: captureTouches is disabled to avoid conflicts with Reanimated animated styles
export const autocaptureConfig = {
  captureScreens: isAnalyticsEnabled,
  captureTouches: false, // Disabled to prevent conflicts with Reanimated
  routeToName: (
    name: string,
    params?: Record<
      string,
      string | number | boolean | null | undefined | string[]
    >
  ) => {
    // Map technical route names to user-friendly screen names
    const screenNameMap: Record<string, string> = {
      index: "Home",
      search: "Search",
      favorites: "Favorites",
      "gestures/[id]": "Gesture Detail",
      "settings/index": "Settings",
      "settings/developer-tools": "Developer Tools",
    };

    // Handle dynamic routes with parameters
    if (name === "gestures/[id]" && params?.id) {
      return "Gesture Detail";
    }

    return screenNameMap[name] || name;
  },
  routeToProperties: (
    name: string,
    params?: Record<
      string,
      string | number | boolean | null | undefined | string[]
    >
  ) => {
    // Add useful properties for analysis
    const properties: Record<
      string,
      string | number | boolean | null | undefined | string[]
    > = {};

    if (name === "gestures/[id]" && params?.id) {
      properties.gesture_id = params.id;
    }

    return Object.keys(properties).length > 0 ? properties : undefined;
  },
};

// Type for analytics properties that allows undefined values during collection
type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

// Helper function to filter out undefined values
function filterProperties(
  properties?: AnalyticsProperties
): Record<string, string | number | boolean | null | string[]> | undefined {
  if (!properties) {
    return;
  }

  const filtered: Record<string, string | number | boolean | null | string[]> =
    {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

// Base event tracking function
export function trackEvent(event: string, properties?: AnalyticsProperties) {
  if (!isAnalyticsEnabled) {
    return;
  }
  if (!posthogInstance) {
    return;
  }
  posthogInstance.capture(event, filterProperties(properties));
}

// User identification
export function identifyUser(
  distinctId: string,
  properties?: AnalyticsProperties
) {
  if (!isAnalyticsEnabled) {
    return;
  }
  if (!posthogInstance) {
    return;
  }
  posthogInstance.identify(distinctId, filterProperties(properties));
}

export async function getDistinctId(): Promise<string> {
  if (!posthogInstance) {
    return "anonymous";
  }
  return posthogInstance.getDistinctId();
}

export function flushAnalytics() {
  if (!posthogInstance) {
    return Promise.resolve();
  }
  return posthogInstance.flush();
}

// ===== SCREEN NAVIGATION EVENTS =====
// Screen tracking is now handled automatically by PostHog autocapture
// Custom screen events can be tracked using trackEvent() if needed

export function trackScreenView(
  screenName: string,
  properties?: Record<string, unknown>
) {
  if (!isAnalyticsEnabled) {
    return;
  }
  if (!posthogInstance) {
    return;
  }
  posthogInstance.screen(screenName, {
    screen_name: screenName,
    ...properties,
  });
}

// ===== SEARCH EVENTS =====

export function trackSearchPerformed(
  query: string,
  categories: string[],
  resultsCount: number,
  searchDuration?: number
) {
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

export function trackSearchCleared(previousQuery?: string) {
  trackEvent("Search Cleared", {
    had_previous_query: !!previousQuery,
    previous_query_length: previousQuery?.length || 0,
  });
}

export function trackSearchCategoryAdded(
  category: string,
  totalCategories: number
) {
  trackEvent("Search Category Added", {
    category,
    total_categories_selected: totalCategories,
  });
}

export function trackSearchCategoryRemoved(
  category: string,
  remainingCategories: number
) {
  trackEvent("Search Category Removed", {
    category,
    remaining_categories: remainingCategories,
  });
}

export function trackRecentSearchSelected(query: string, position: number) {
  trackEvent("Recent Search Selected", {
    query,
    query_length: query.length,
    position_in_list: position,
  });
}

// ===== GESTURE INTERACTION EVENTS =====

export function trackGestureViewed(
  gestureId: string,
  gestureName: string,
  categories: string[],
  viewSource: "search_results" | "favorites" | "related_gestures"
) {
  trackEvent("Gesture Viewed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    view_source: viewSource,
  });
}

export function trackGestureLiked(
  gestureId: string,
  gestureName: string,
  categories: string[],
  interactionType: "button_tap" | "double_tap" | "undo"
) {
  trackEvent("Gesture Liked", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    interaction_type: interactionType,
  });
}

export function trackGestureUnliked(
  gestureId: string,
  gestureName: string,
  categories: string[],
  interactionType: "button_tap" | "undo"
) {
  trackEvent("Gesture Unliked", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    interaction_type: interactionType,
  });
}

// ===== VIDEO PLAYER EVENTS =====

export function trackVideoPlayerOpened(
  gestureId: string,
  gestureName: string,
  autoplay: boolean
) {
  trackEvent("Video Player Opened", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    autoplay_enabled: autoplay,
  });
}

export function trackVideoPlaybackStarted(
  gestureId: string,
  gestureName: string,
  trigger: "autoplay" | "manual_play"
) {
  trackEvent("Video Playback Started", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    trigger,
  });
}

export function trackVideoPlaybackPaused(
  gestureId: string,
  gestureName: string,
  watchTimeSeconds?: number
) {
  trackEvent("Video Playback Paused", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    watch_time_seconds: watchTimeSeconds,
  });
}

export function trackVideoPlaybackCompleted(
  gestureId: string,
  gestureName: string,
  watchTimeSeconds?: number,
  loopCount?: number
) {
  trackEvent("Video Playback Completed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    watch_time_seconds: watchTimeSeconds,
    loop_count: loopCount,
  });
}

export function trackVideoAlmostCompleted(
  gestureId: string,
  gestureName: string
) {
  trackEvent("Video Almost Completed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
  });
}

// ===== CATEGORY INTERACTION EVENTS =====

export function trackCategoryPressed(
  category: string,
  source: "gesture_detail" | "search_filter" | "category_browser"
) {
  trackEvent("Category Pressed", {
    category,
    source,
  });
}

// ===== FAVORITES MANAGEMENT EVENTS =====

export function trackFavoriteAdded(
  gestureId: string,
  gestureName: string,
  categories: string[],
  source:
    | "gesture_detail"
    | "search_results"
    | "favorites_screen"
    | "related_gestures"
) {
  trackEvent("Favorite Added", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    source,
  });
}

export function trackFavoriteRemoved(
  gestureId: string,
  gestureName: string,
  categories: string[],
  source:
    | "gesture_detail"
    | "search_results"
    | "favorites_screen"
    | "related_gestures"
) {
  trackEvent("Favorite Removed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    source,
  });
}

export function trackFavoriteUndoAction(
  gestureId: string,
  gestureName: string,
  action: "undo_add" | "undo_remove"
) {
  trackEvent("Favorite Undo Action", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    undo_action: action,
  });
}

// ===== UI INTERACTION EVENTS =====

export function trackBottomSheetOpened(
  sheetType: "options" | "category_selection" | "settings"
) {
  trackEvent("Bottom Sheet Opened", {
    sheet_type: sheetType,
  });
}

export function trackBottomSheetClosed(
  sheetType: "options" | "category_selection" | "settings"
) {
  trackEvent("Bottom Sheet Closed", {
    sheet_type: sheetType,
  });
}

export function trackToastShown(
  message: string,
  type: "info" | "success" | "warning" | "error",
  hasAction: boolean
) {
  trackEvent("Toast Shown", {
    toast_type: type,
    has_action: hasAction,
    message_length: message.length,
  });
}

export function trackToastActionPressed(actionType: string) {
  trackEvent("Toast Action Pressed", {
    action_type: actionType,
  });
}

// ===== SETTINGS EVENTS =====

export function trackSettingsOptionSelected(option: string) {
  trackEvent("Settings Option Selected", {
    setting_option: option,
  });
}

export function trackThemeChanged(newTheme: string, previousTheme: string) {
  trackEvent("Theme Changed", {
    new_theme: newTheme,
    previous_theme: previousTheme,
  });
}

export function trackLanguageChanged(
  newLanguage: string,
  previousLanguage: string
) {
  trackEvent("Language Changed", {
    new_language: newLanguage,
    previous_language: previousLanguage,
  });
}

// ===== APP LIFECYCLE EVENTS =====

export function trackAppOpened(
  isFirstLaunch: boolean,
  timeSinceLastOpen?: number
) {
  trackEvent("App Opened", {
    is_first_launch: isFirstLaunch,
    time_since_last_open_minutes: timeSinceLastOpen,
  });
}

export function trackAppBackgrounded(sessionDurationSeconds: number) {
  trackEvent("App Backgrounded", {
    session_duration_seconds: sessionDurationSeconds,
  });
}

// ===== PERFORMANCE EVENTS =====

export function trackSearchPerformance(
  query: string,
  durationMs: number,
  resultsCount: number
) {
  trackEvent("Search Performance", {
    query_length: query.length,
    search_duration_ms: durationMs,
    results_count: resultsCount,
    performance_category:
      durationMs < 500 ? "fast" : durationMs < 1000 ? "medium" : "slow",
  });
}

export function trackLoadMoreResults(
  currentResultsCount: number,
  newResultsCount: number
) {
  trackEvent("Load More Results", {
    current_results_count: currentResultsCount,
    new_results_count: newResultsCount,
    results_added: newResultsCount - currentResultsCount,
  });
}

// ===== ERROR TRACKING =====

export function trackError(
  errorType: string,
  errorMessage: string,
  context?: Record<string, unknown>
) {
  trackEvent("Error Occurred", {
    error_type: errorType,
    error_message: errorMessage,
    ...context,
  });
}

export function trackVideoError(
  gestureId: string,
  gestureName: string,
  errorType: string,
  errorMessage: string
) {
  trackEvent("Video Error", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    error_type: errorType,
    error_message: errorMessage,
  });
}

// ===== ENGAGEMENT EVENTS =====

export function trackUserEngagement(
  sessionDuration: number,
  gesturesViewed: number,
  searchesPerformed: number,
  favoritesAdded: number
) {
  trackEvent("User Engagement Summary", {
    session_duration_minutes: Math.round(sessionDuration / 60),
    gestures_viewed: gesturesViewed,
    searches_performed: searchesPerformed,
    favorites_added: favoritesAdded,
    engagement_score:
      gesturesViewed * 2 + searchesPerformed * 1 + favoritesAdded * 3,
  });
}

export function trackFeatureUsage(feature: string, usageCount: number) {
  trackEvent("Feature Usage", {
    feature_name: feature,
    usage_count: usageCount,
    is_power_user: usageCount >= 10,
  });
}

// ===== GESTURE LEARNING SPECIFIC EVENTS =====

export function trackGestureLearningSession(
  gestureId: string,
  gestureName: string,
  categories: string[],
  timeSpentSeconds: number,
  videoLoopCount: number,
  practicingIntention: boolean
) {
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

export function trackGestureRepetitionPractice(
  gestureId: string,
  gestureName: string,
  repetitionCount: number,
  sessionDurationSeconds: number
) {
  trackEvent("Gesture Repetition Practice", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    repetition_count: repetitionCount,
    session_duration_seconds: sessionDurationSeconds,
    practice_effectiveness:
      repetitionCount > 10 ? "high" : repetitionCount > 5 ? "medium" : "low",
  });
}

export function trackCategoryLearningProgress(
  category: string,
  gesturesViewedInCategory: number,
  gesturesFavoritedInCategory: number,
  totalGesturesInCategory: number
) {
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

export function trackLearningPathway(
  startCategory: string,
  endCategory: string,
  gesturesExplored: number,
  timeSpentMinutes: number
) {
  trackEvent("Learning Pathway", {
    start_category: startCategory,
    end_category: endCategory,
    gestures_explored: gesturesExplored,
    time_spent_minutes: timeSpentMinutes,
    learning_flow_type:
      startCategory === endCategory ? "focused" : "exploratory",
  });
}

export function trackGestureConfidenceLevel(
  gestureId: string,
  gestureName: string,
  categories: string[],
  confidenceLevel: "beginner" | "intermediate" | "advanced",
  viewCount: number,
  favoriteStatus: boolean
) {
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

export function trackLearningGoalProgress(
  goalType: "daily_gestures" | "category_completion" | "favorite_count",
  currentProgress: number,
  targetGoal: number,
  timeFrameDays: number
) {
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
) {
  trackEvent("Gesture Discovery", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
    discovery_method: discoveryMethod,
    search_query: searchQuery,
    is_targeted_discovery: !!searchQuery,
  });
}

export function trackLearningStreakUpdate(
  currentStreak: number,
  longestStreak: number,
  streakType: "daily_app_usage" | "daily_new_gestures" | "daily_practice",
  streakBroken: boolean
) {
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
) {
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

export function trackLearningEffectiveness(sessionMetrics: {
  sessionDurationMinutes: number;
  uniqueGesturesViewed: number;
  gesturesAddedToFavorites: number;
  categoriesExplored: string[];
  searchesPerformed: number;
  videoCompletionRate: number;
}) {
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

// Check if analytics is enabled
export function isAnalyticsActive(): boolean {
  return isAnalyticsEnabled;
}

export default posthogInstance;
