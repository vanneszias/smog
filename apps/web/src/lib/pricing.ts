import type { SponsorshipPricing } from "@smog/types";

export const PRICE_PER_WEEK_CENTS = 5000; // €50.00 per week

export const DURATION_OPTIONS = [
  { label: "1 Week", weeks: 1 },
  { label: "2 Weeks", weeks: 2 },
  { label: "4 Weeks (1 Month)", weeks: 4 },
  { label: "8 Weeks (2 Months)", weeks: 8 },
  { label: "12 Weeks (3 Months)", weeks: 12 },
] as const;

/**
 * Calculate sponsorship pricing
 */
export function calculatePrice(weeks: number): SponsorshipPricing {
  return {
    pricePerWeekCents: PRICE_PER_WEEK_CENTS,
    weeks,
    totalCents: PRICE_PER_WEEK_CENTS * weeks,
  };
}

/**
 * Format price in cents to EUR string
 */
export function formatPrice(cents: number): string {
  const euros = cents / 100;
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
  }).format(euros);
}

/**
 * Get price breakdown string
 */
export function getPriceBreakdown(weeks: number): string {
  const pricing = calculatePrice(weeks);
  return `${formatPrice(pricing.pricePerWeekCents)}/week × ${weeks} weeks = ${formatPrice(pricing.totalCents)} total`;
}
