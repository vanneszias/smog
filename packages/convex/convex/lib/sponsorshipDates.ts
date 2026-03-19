/**
 * @fileoverview Date calculation helpers for sponsorship records.
 *
 * Pure functions for computing sponsorship start/end dates and formatting
 * date ranges for display. Extracted from `sponsorships.ts` to keep mutation
 * handlers focused on orchestration logic.
 *
 * Note: Constants are intentionally kept local here (duplicated from
 * `@smog/config`) because Convex functions run in an isolated server
 * runtime and cannot import from external workspace packages.
 *
 * @example
 * const endDate = calculateEndDate(durationYears);
 * const { startDate, endDate } = activateDates(durationYears);
 */

/** Milliseconds in one year (365 days). */
const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * Calculate a sponsorship end date from the current time.
 *
 * @param durationYears - Duration in years (e.g. 1).
 * @returns Unix timestamp (ms) for the end date.
 *
 * @example
 * const endDate = calculateEndDate(1);
 */
export function calculateEndDate(durationYears: number): number {
  return Date.now() + durationYears * MS_PER_YEAR;
}

/**
 * Calculate both start and end dates for activating a sponsorship.
 *
 * `startDate` is always "now" (the moment of activation).
 *
 * @param durationYears - Duration in years.
 * @returns `{ startDate, endDate }` as Unix timestamps (ms).
 */
export function activateDates(durationYears: number): {
  startDate: number;
  endDate: number;
} {
  const startDate = Date.now();
  return { startDate, endDate: startDate + durationYears * MS_PER_YEAR };
}

/**
 * Convert a week-based duration to years (rounded up).
 *
 * Legacy mutations use `durationWeeks`; this converts to the canonical
 * `durationYears` field.
 *
 * @param durationWeeks - Duration in weeks.
 * @returns Duration in years (ceiling division by 52).
 */
export function weeksToYears(durationWeeks: number): number {
  return Math.ceil(durationWeeks / 52);
}

/**
 * Calculate a provisional end date using week-based duration (legacy).
 *
 * @param durationWeeks - Duration in weeks.
 * @returns Unix timestamp (ms) for the end date.
 */
export function calculateEndDateFromWeeks(durationWeeks: number): number {
  return Date.now() + durationWeeks * 7 * 24 * 60 * 60 * 1000;
}

/**
 * Format a Unix timestamp as a locale date string.
 *
 * @param timestamp - Unix timestamp in milliseconds.
 * @param locale - BCP 47 locale tag (default: "nl-BE").
 * @returns Formatted date string, e.g. "18/3/2026".
 */
export function formatSponsorshipDate(
  timestamp: number,
  locale = "nl-BE"
): string {
  return new Date(timestamp).toLocaleDateString(locale);
}

/**
 * Format a sponsorship's start–end range as a human-readable string.
 *
 * @param startDate - Start Unix timestamp (ms). Pass `0` for "pending start".
 * @param endDate - End Unix timestamp (ms).
 * @returns E.g. "18/3/2026 – 18/3/2027".
 */
export function formatDateRange(
  startDate: number,
  endDate: number,
  locale = "nl-BE"
): string {
  const start = startDate > 0 ? formatSponsorshipDate(startDate, locale) : "–";
  const end = formatSponsorshipDate(endDate, locale);
  return `${start} – ${end}`;
}
