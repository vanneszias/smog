/**
 * @fileoverview Type definitions for the analytics service.
 *
 * These types define the shape of event properties and configuration used
 * throughout the analytics module.
 */

/**
 * Generic analytics property value type.
 * Mirrors PostHog's accepted property value types.
 */
export type AnalyticsPropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[];

/** A bag of analytics event properties (may include undefined values before filtering). */
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

/** A bag of filtered analytics event properties (undefined values removed). */
export type FilteredProperties = Record<
  string,
  string | number | boolean | null | string[]
>;

/**
 * PostHog autocapture route parameter types.
 * Matches what Expo Router passes to route-to-name functions.
 */
export type RouteParams = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;
