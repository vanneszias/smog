/**
 * @fileoverview Main entry point for the @smog/shared package.
 *
 * The analytics event vocabulary that `apps/site` and `apps/mobile` both send,
 * so the two cannot drift.
 *
 * @example
 * import type { AnalyticsEventMap, AnalyticsEventName } from "@smog/shared";
 */

export type { AnalyticsEventMap, AnalyticsEventName } from "./analytics";
