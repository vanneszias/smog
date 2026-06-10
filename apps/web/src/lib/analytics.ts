import { getStoredConsent, isAnalyticsEnabled } from "@smog/hooks";

const POSTHOG_API_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_API_KEY || "";
const POSTHOG_HOST =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let consent: ReturnType<typeof getStoredConsent> = null;
let posthogPromise: Promise<typeof import("posthog-js").default | null> | null =
  null;

function getAnalyticsEnabled(): boolean {
  return isAnalyticsEnabled(consent);
}

function reportAnalyticsError(error: unknown) {
  console.error("[Analytics] Failed to load PostHog:", error);
}

function getPostHog() {
  if (!POSTHOG_API_KEY) {
    return Promise.resolve(null);
  }

  posthogPromise ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      capture_pageleave: true,
      persistence: "localStorage",
      disable_session_recording: true,
    });
    return posthog;
  });

  return posthogPromise;
}

export const initializeAnalytics = () => {
  consent = getStoredConsent();
  if (getAnalyticsEnabled()) {
    getPostHog().catch(reportAnalyticsError);
  }
};

export const onConsentChange = (
  newConsent: ReturnType<typeof getStoredConsent>
) => {
  consent = newConsent;
  const enabled = getAnalyticsEnabled();

  if (enabled) {
    getPostHog()
      .then((posthog) => posthog?.opt_in_capturing())
      .catch(reportAnalyticsError);
  } else if (posthogPromise) {
    posthogPromise
      .then((posthog) => {
        posthog?.opt_out_capturing();
        posthog?.reset();
      })
      .catch(reportAnalyticsError);
  }
};

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

function trackEvent(event: string, properties?: AnalyticsProperties) {
  if (!getAnalyticsEnabled()) {
    return;
  }
  getPostHog()
    .then((posthog) =>
      posthog?.capture(event, {
        ...baseProperties,
        ...filterProperties(properties),
      })
    )
    .catch(reportAnalyticsError);
}

export function trackPageView(path: string, properties?: AnalyticsProperties) {
  if (!getAnalyticsEnabled()) {
    return;
  }
  getPostHog()
    .then((posthog) =>
      posthog?.capture("$pageview", {
        ...baseProperties,
        $current_url: window.location.href,
        path,
        ...properties,
      })
    )
    .catch(reportAnalyticsError);
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

export function trackGestureSavedToList(
  gestureId: string,
  gestureName: string,
  categories: string[]
) {
  trackEvent("Gesture Saved To List", {
    gesture_categories: categories,
    gesture_id: gestureId,
    gesture_name: gestureName,
  });
}

export function trackGestureRemovedFromList(
  gestureId: string,
  gestureName: string,
  categories: string[]
) {
  trackEvent("Gesture Removed From List", {
    gesture_categories: categories,
    gesture_id: gestureId,
    gesture_name: gestureName,
  });
}
