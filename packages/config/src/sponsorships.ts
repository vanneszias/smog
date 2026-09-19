/**
 * @fileoverview Sponsorship lifecycle statuses.
 *
 * These exact strings exist in production rows and in the Mollie payment
 * flow. Do not rename, reorder or drop one.
 *
 * Lives here rather than in the Payload collection because `@smog/ui-web`
 * needs the runtime values for StatusBadge and cannot import from `apps/`.
 * The generated Payload types give a type union, not an array, so they
 * cannot serve that purpose.
 */
export const SPONSORSHIP_STATUSES = [
  "pending_payment",
  "pending_approval",
  "pending_resubmission",
  "active",
  "expired",
  "rejected",
  "cancelled",
] as const;

export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];
