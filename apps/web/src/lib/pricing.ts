/**
 * Simplified sponsorship pricing
 * Fixed pricing: €50 per gesture per year, +€10 for logo
 */

export const PRICE_PER_YEAR_CENTS = 5000; // €50.00 per year per gesture
export const LOGO_ADDON_CENTS = 1000; // €10.00 for logo addon
export const FIXED_DURATION_YEARS = 1; // Always 1 year

export interface SponsorshipPricing {
  gestureCount: number;
  includeLogo: boolean;
  pricePerGestureCents: number;
  logoAddonCents: number;
  subtotalCents: number;
  totalCents: number;
  durationYears: number;
}

/**
 * Calculate sponsorship pricing
 */
export function calculateSimplifiedPrice(
  gestureCount: number,
  includeLogo: boolean
): SponsorshipPricing {
  const pricePerGesture = includeLogo
    ? PRICE_PER_YEAR_CENTS + LOGO_ADDON_CENTS
    : PRICE_PER_YEAR_CENTS;

  const subtotal = PRICE_PER_YEAR_CENTS * gestureCount;
  const logoTotal = includeLogo ? LOGO_ADDON_CENTS * gestureCount : 0;

  return {
    gestureCount,
    includeLogo,
    pricePerGestureCents: pricePerGesture,
    logoAddonCents: logoTotal,
    subtotalCents: subtotal,
    totalCents: subtotal + logoTotal,
    durationYears: FIXED_DURATION_YEARS,
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
