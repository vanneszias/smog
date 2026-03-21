/**
 * @fileoverview GDPR analytics consent management.
 *
 * Manages whether analytics data collection is enabled based on the user's
 * explicit consent. Consent is persisted in AsyncStorage so it survives app
 * restarts.
 *
 * Consent flow:
 * 1. `initializeAnalytics()` — called at app startup; reads stored consent.
 * 2. `enableAnalytics()` / `disableAnalytics()` — called from the GDPR modal.
 * 3. `isAnalyticsActive()` — read anywhere to check current state.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "@smog/config/constants";
import logger from "@/utils/logger";
import { posthogInstance } from "./config";

/** Module-level flag tracking current consent state. */
let isAnalyticsEnabled = false;

/**
 * Read the persisted consent choice and configure PostHog accordingly.
 * Must be called once at app startup before tracking any events.
 */
export const initializeAnalytics = async (): Promise<void> => {
  const consent = await AsyncStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
  isAnalyticsEnabled = consent === "true";

  if (!isAnalyticsEnabled) {
    logger.log("[analytics/consent] User opted out of analytics");
    posthogInstance.optOut();
    return;
  }

  posthogInstance.optIn();
  logger.log("[analytics/consent] PostHog initialised");
};

/**
 * Enable analytics tracking and persist the consent choice.
 * Call this when the user accepts analytics in the GDPR modal.
 */
export const enableAnalytics = async (): Promise<void> => {
  isAnalyticsEnabled = true;
  await AsyncStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "true");
  await initializeAnalytics();
};

/**
 * Disable analytics tracking, persist the choice, and clear the user identity.
 * Call this when the user opts out in the GDPR modal or settings.
 */
export const disableAnalytics = async (): Promise<void> => {
  isAnalyticsEnabled = false;
  await AsyncStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "false");
  posthogInstance.optOut();
  posthogInstance.reset();
  logger.log("[analytics/consent] Analytics disabled");
};

/**
 * Returns `true` if the user has consented to analytics tracking.
 */
export const isAnalyticsActive = (): boolean => isAnalyticsEnabled;

/**
 * Internal getter for the enabled flag, used by `tracking.ts`.
 * @internal
 */
export const getIsAnalyticsEnabled = (): boolean => isAnalyticsEnabled;
