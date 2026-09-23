/**
 * @fileoverview Application-wide constants for the SMOG monorepo.
 *
 * Centralises "magic numbers" and string constants to make them easy to find,
 * change, and document. Import from `@smog/config/constants` in any app or
 * package that needs these values.
 *
 * @example
 * import { MAX_GESTURES_PER_SPONSORSHIP, PRICE_PER_YEAR_CENTS } from "@smog/config/constants";
 */

// ─── Sponsorship ──────────────────────────────────────────────────────────────

/**
 * Maximum number of gestures a sponsor can select in one sponsorship order.
 */
export const MAX_GESTURES_PER_SPONSORSHIP = 10;

// ─── Sponsorship Pricing ──────────────────────────────────────────────────────

/**
 * Base price per gesture per year of sponsorship, in euro cents.
 * €50.00 = 5000 cents.
 */
export const PRICE_PER_YEAR_CENTS = 5000;

/**
 * Additional price for including a logo overlay, in euro cents.
 * €10.00 = 1000 cents.
 */
export const LOGO_ADDON_CENTS = 1000;

/**
 * Fixed sponsorship duration in years.
 * All sponsorships are currently for exactly 1 year.
 */
export const FIXED_DURATION_YEARS = 1;
