/**
 * @fileoverview Analytics service — public API for the SMOG native app.
 *
 * This module integrates PostHog for event tracking and GDPR consent management.
 * It implements a privacy-first approach where no data is collected until the
 * user explicitly consents via the GDPR modal.
 *
 * @architecture
 * ```
 * PostHogProvider (app root)
 *   └─ analytics/config.ts    — posthogInstance + autocaptureConfig
 *       ├─ analytics/consent.ts  — initializeAnalytics / enable / disable
 *       └─ analytics/tracking.ts — typed event functions
 * ```
 *
 * @example
 * // In app root:
 * import { posthog, autocaptureConfig } from "@/services/analytics";
 * import { initializeAnalytics } from "@/services/analytics";
 *
 * // In a component:
 * import { trackGestureViewed } from "@/services/analytics";
 * trackGestureViewed(gesture.id, gesture.name, gesture.category, "search_results");
 */

// PostHog instance + provider config
export { autocaptureConfig, posthogInstance as posthog } from "./config";

// Consent management
export {
  disableAnalytics,
  enableAnalytics,
  initializeAnalytics,
  isAnalyticsActive,
} from "./consent";
// Core tracking utilities
// Screen navigation
// Search
// Gesture interactions
// Video player
// Categories
// Favorites
// UI interactions
// Settings
// App lifecycle
// Performance
// Errors
// Engagement
// Gesture learning
export {
  flushAnalytics,
  getDistinctId,
  identifyUser,
  trackAppBackgrounded,
  trackAppOpened,
  trackBottomSheetClosed,
  trackBottomSheetOpened,
  trackCategoryLearningProgress,
  trackCategoryPressed,
  trackError,
  trackEvent,
  trackFavoriteAdded,
  trackFavoriteRemoved,
  trackFavoriteUndoAction,
  trackFeatureUsage,
  trackGestureComprehension,
  trackGestureConfidenceLevel,
  trackGestureDiscovery,
  trackGestureLearningSession,
  trackGestureLiked,
  trackGestureRepetitionPractice,
  trackGestureUnliked,
  trackGestureViewed,
  trackLanguageChanged,
  trackLearningEffectiveness,
  trackLearningGoalProgress,
  trackLearningPathway,
  trackLearningStreakUpdate,
  trackLoadMoreResults,
  trackRecentSearchSelected,
  trackScreenView,
  trackSearchCategoryAdded,
  trackSearchCategoryRemoved,
  trackSearchCleared,
  trackSearchPerformance,
  trackSearchPerformed,
  trackSettingsOptionSelected,
  trackThemeChanged,
  trackUserEngagement,
  trackVideoAlmostCompleted,
  trackVideoError,
  trackVideoPlaybackCompleted,
  trackVideoPlaybackPaused,
  trackVideoPlaybackStarted,
  trackVideoPlayerOpened,
} from "./tracking";
