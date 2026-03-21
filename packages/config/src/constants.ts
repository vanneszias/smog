/**
 * @fileoverview Application-wide constants for the SMOG monorepo.
 *
 * Centralises "magic numbers" and string constants to make them easy to find,
 * change, and document. Import from `@smog/config/constants` in any app or
 * package that needs these values.
 *
 * @example
 * import { VIDEO_COMPLETE_COUNT, PRICE_PER_YEAR_CENTS } from "@smog/config/constants";
 */

// ─── Video / Gesture Learning ─────────────────────────────────────────────────

/**
 * Number of gesture videos a user must complete before seeing the
 * DisclaimerBanner prompt to enrol in a course.
 *
 * Previously hardcoded as `7` in `apps/native/components/DisclaimerBanner.tsx`.
 */
export const VIDEO_COMPLETE_COUNT = 7;

/**
 * Default number of gestures shown per page in list views.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Maximum number of gestures a sponsor can select in one sponsorship order.
 */
export const MAX_GESTURES_PER_SPONSORSHIP = 10;

// ─── Sponsorship Pricing ──────────────────────────────────────────────────────

/**
 * Base price per gesture per year of sponsorship, in euro cents.
 * €50.00 = 5000 cents.
 *
 * Previously defined in `apps/web/src/lib/pricing.ts`.
 */
export const PRICE_PER_YEAR_CENTS = 5000;

/**
 * Additional price for including a logo overlay, in euro cents.
 * €10.00 = 1000 cents.
 *
 * Previously defined in `apps/web/src/lib/pricing.ts`.
 */
export const LOGO_ADDON_CENTS = 1000;

/**
 * Fixed sponsorship duration in years.
 * All sponsorships are currently for exactly 1 year.
 *
 * Previously defined in `apps/web/src/lib/pricing.ts`.
 */
export const FIXED_DURATION_YEARS = 1;

// ─── Cache / Sync Timings ─────────────────────────────────────────────────────

/**
 * Interval between background sync attempts in milliseconds.
 * 2 hours = 2 × 60 × 60 × 1000 ms.
 *
 * Previously hardcoded in `apps/native/services/convexSyncService.ts`.
 */
export const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * Delay before retrying a failed sync, in milliseconds.
 * 5 minutes = 5 × 60 × 1000 ms.
 *
 * Previously hardcoded in `apps/native/services/convexSyncService.ts`.
 */
export const SYNC_RETRY_DELAY_MS = 5 * 60 * 1000;

/**
 * Maximum number of sync retries before giving up.
 *
 * Previously hardcoded in `apps/native/services/convexSyncService.ts`.
 */
export const MAX_SYNC_RETRIES = 3;

// ─── Analytics Storage Keys ───────────────────────────────────────────────────

/**
 * AsyncStorage key used to persist the user's analytics consent choice.
 *
 * Previously hardcoded in `apps/native/services/analyticsService.ts`.
 */
export const ANALYTICS_CONSENT_STORAGE_KEY = "@smog_analytics_consent";

// ─── Database ─────────────────────────────────────────────────────────────────

/**
 * Name of the local SQLite database file.
 *
 * Previously hardcoded in `apps/native/services/databaseService.ts`.
 */
export const SQLITE_DATABASE_NAME = "gestures.db";

/**
 * Current target version of the local SQLite schema.
 * Increment this whenever a migration is added.
 *
 * Previously hardcoded in `apps/native/services/databaseService.ts`.
 */
export const DATABASE_TARGET_VERSION = 3;
