/**
 * @fileoverview PostHog configuration and instance setup.
 *
 * Creates the global PostHog instance and exports the autocapture config used
 * by the `PostHogProvider` in the app root. Consent management is handled in
 * `consent.ts`; event tracking is in `tracking.ts`.
 *
 * Environment variables:
 * - `EXPO_PUBLIC_POSTHOG_API_KEY` — PostHog project API key
 * - `EXPO_PUBLIC_POSTHOG_HOST` — PostHog host (defaults to EU datacenter)
 */

import { POSTHOG_DEFAULT_HOST } from "@smog/config/urls";
import PostHog from "posthog-react-native";
import type { RouteParams } from "./types";

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "";
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? POSTHOG_DEFAULT_HOST;

/**
 * Singleton PostHog client instance.
 *
 * Initialised with:
 * - `captureAppLifecycleEvents: false` — we track these manually for more control.
 * - `enableSessionReplay: false` — not enabled for privacy reasons.
 * - `captureTouches: false` — disabled to avoid conflicts with Reanimated animated styles.
 */
export const posthogInstance = new PostHog(POSTHOG_API_KEY, {
  host: POSTHOG_HOST,
  captureAppLifecycleEvents: false,
  enableSessionReplay: false,
});

/**
 * Autocapture configuration for the `PostHogProvider`.
 *
 * Maps technical Expo Router route names to human-friendly screen names and
 * attaches platform metadata to each screen event.
 */
export const autocaptureConfig = {
  captureScreens: true,
  captureTouches: false,
  routeToName: (name: string, params?: RouteParams): string => {
    const screenNameMap: Record<string, string> = {
      index: "Home",
      search: "Search",
      favorites: "Favorites",
      "gestures/[id]": "Gesture Detail",
      "settings/index": "Settings",
      "settings/developer-tools": "Developer Tools",
    };

    if (name === "gestures/[id]" && params?.id) {
      return "Gesture Detail";
    }

    return screenNameMap[name] ?? name;
  },
  routeToProperties: (name: string, params?: RouteParams): RouteParams => {
    const properties: RouteParams = { platform: "native" };

    if (name === "gestures/[id]" && params?.id) {
      properties.gesture_id = params.id;
    }

    return properties;
  },
};
