/**
 * @fileoverview Sponsorship pricing utilities for the web app.
 *
 * Pricing constants are sourced from `@smog/config/constants` to keep them
 * in sync with the rest of the monorepo. This file exposes them alongside
 * helper functions for price formatting and calculation.
 */

import {
  FIXED_DURATION_YEARS,
  LOGO_ADDON_CENTS,
  PRICE_PER_YEAR_CENTS,
} from "@smog/config/constants";
import type { SponsorshipPricing } from "@smog/types";

export { LOGO_ADDON_CENTS, PRICE_PER_YEAR_CENTS };

/**
 * Calculate the full pricing breakdown for a sponsorship order.
 *
 * @param gestureCount - How many gestures the sponsor is covering.
 * @param includeLogo - Whether the logo overlay add-on is included.
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
 * Format a price in euro cents to a localised EUR string.
 *
 * @example
 * formatPrice(5000) // "€50.00"
 */
export function formatPrice(cents: number): string {
  const euros = cents / 100;
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
  }).format(euros);
}
