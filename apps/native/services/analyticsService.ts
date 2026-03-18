/**
 * @fileoverview Backward-compatibility re-export for the analytics service.
 *
 * The analytics service has been decomposed into the `analytics/` directory:
 * - `analytics/types.ts`    — shared type definitions
 * - `analytics/config.ts`   — PostHog instance and autocapture config
 * - `analytics/consent.ts`  — GDPR consent management
 * - `analytics/tracking.ts` — typed event-tracking functions
 * - `analytics/index.ts`    — public API re-exports
 *
 * This file re-exports everything from `analytics/index.ts` so that existing
 * imports of `@/services/analyticsService` continue to work without changes.
 *
 * @deprecated Prefer importing from `@/services/analytics` directly.
 */

export { posthogInstance as default } from "./analytics/config";
export * from "./analytics/index";
