import { getStoredConsent, isAnalyticsEnabled } from "@smog/hooks";
import posthog from "posthog-js";

const POSTHOG_API_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_API_KEY || "";
const POSTHOG_HOST =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let consent: ReturnType<typeof getStoredConsent> = null;

function getAnalyticsEnabled(): boolean {
  return isAnalyticsEnabled(consent);
}

export const initializeAnalytics = () => {
  consent = getStoredConsent();
  const enabled = getAnalyticsEnabled();

  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage",
    disable_session_recording: true,
    opt_out_capturing_by_default: !enabled,
  });

  console.log("[Analytics] PostHog initialized", { enabled });
};

export const onConsentChange = (
  newConsent: ReturnType<typeof getStoredConsent>
) => {
  consent = newConsent;
  const enabled = getAnalyticsEnabled();

  if (enabled) {
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
    posthog.reset();
  }

  console.log("[Analytics] Consent changed", { enabled });
};

export function isAnalyticsActive(): boolean {
  return getAnalyticsEnabled();
}

type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

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

const baseProperties: AnalyticsProperties = {
  platform: "web",
};

export function trackEvent(event: string, properties?: AnalyticsProperties) {
  if (!getAnalyticsEnabled()) {
    return;
  }
  posthog.capture(event, {
    ...baseProperties,
    ...filterProperties(properties),
  });
}

export function identifyUser(
  distinctId: string,
  properties?: AnalyticsProperties
) {
  if (!getAnalyticsEnabled()) {
    return;
  }
  posthog.identify(distinctId, filterProperties(properties));
}

export function getDistinctId(): string {
  return posthog.get_distinct_id();
}

export function trackPageView(path: string, properties?: AnalyticsProperties) {
  if (!getAnalyticsEnabled()) {
    return;
  }
  posthog.capture("$pageview", {
    ...baseProperties,
    $current_url: window.location.href,
    path,
    ...properties,
  });
}

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
  interactionType: "button_tap" | "undo"
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

export function trackVideoPlaybackStarted(
  gestureId: string,
  gestureName: string,
  autoplay: boolean
) {
  trackEvent("Video Playback Started", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    autoplay_enabled: autoplay,
  });
}

export function trackVideoPlaybackPaused(
  gestureId: string,
  gestureName: string,
  watchTime: number
) {
  trackEvent("Video Playback Paused", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    watch_time_ms: watchTime,
  });
}

export function trackVideoPlaybackCompleted(
  gestureId: string,
  gestureName: string,
  watchTime: number,
  loopCount: number
) {
  trackEvent("Video Playback Completed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    watch_time_ms: watchTime,
    loop_count: loopCount,
  });
}

export function trackVideoAlmostCompleted(
  gestureId: string,
  gestureName: string,
  watchTime: number
) {
  trackEvent("Video Almost Completed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    watch_time_ms: watchTime,
  });
}

export function trackFavoriteAdded(
  gestureId: string,
  gestureName: string,
  categories: string[]
) {
  trackEvent("Favorite Added", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
  });
}

export function trackFavoriteRemoved(
  gestureId: string,
  gestureName: string,
  categories: string[]
) {
  trackEvent("Favorite Removed", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    gesture_categories: categories,
  });
}

export function trackFavoriteUndoAction(
  gestureId: string,
  gestureName: string,
  action: "add" | "remove"
) {
  trackEvent("Favorite Undo Action", {
    gesture_id: gestureId,
    gesture_name: gestureName,
    action,
  });
}

export function trackCategoryPressed(
  categoryName: string,
  totalGestures: number,
  source: string
) {
  trackEvent("Category Pressed", {
    category_name: categoryName,
    total_gestures: totalGestures,
    source,
  });
}

export function trackUserEngagement(
  sessionDuration: number,
  gestureViews: number,
  searchCount: number
) {
  trackEvent("User Engagement", {
    session_duration_ms: sessionDuration,
    gesture_views: gestureViews,
    search_count: searchCount,
  });
}
