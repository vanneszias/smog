/**
 * @fileoverview Sponsorship status transition helpers.
 *
 * Defines the valid status state machine and provides helper functions for
 * checking and performing status transitions. Extracted from `sponsorships.ts`
 * to make transition logic explicit and testable.
 *
 * Status machine:
 * ```
 * pending
 *   └─ pending_payment     (after Mollie payment link created)
 *       └─ pending_approval (after payment received)
 *           ├─ active           (approved by admin)
 *           ├─ rejected         (rejected by admin)
 *           └─ pending_resubmission → pending_approval (sponsor re-submits)
 * active
 *   └─ expired              (scheduled cron)
 * ```
 */

/** All valid sponsorship status values. */
export type SponsorshipStatus =
  | "pending"
  | "pending_payment"
  | "pending_approval"
  | "pending_resubmission"
  | "active"
  | "rejected"
  | "expired"
  | "cancelled";

/** Statuses that indicate a sponsorship is blocking a gesture from new sponsors. */
export const BLOCKING_STATUSES: SponsorshipStatus[] = [
  "pending",
  "pending_payment",
  "pending_approval",
  "active",
];

/** Statuses that are considered "pending" (user waiting for outcome). */
export const PENDING_STATUSES: SponsorshipStatus[] = [
  "pending",
  "pending_payment",
  "pending_approval",
  "pending_resubmission",
];

/** Statuses that are terminal (no further transitions expected). */
export const TERMINAL_STATUSES: SponsorshipStatus[] = [
  "rejected",
  "expired",
  "cancelled",
];

/**
 * Returns `true` if the given status is a "pending" status.
 *
 * @example
 * isPending("pending_approval") // true
 * isPending("active")           // false
 */
export function isPending(status: SponsorshipStatus): boolean {
  return PENDING_STATUSES.includes(status);
}

/**
 * Returns `true` if the given status is terminal (no further transitions).
 */
export function isTerminal(status: SponsorshipStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Returns `true` if the given status blocks a gesture from new sponsorships.
 */
export function isBlocking(status: SponsorshipStatus): boolean {
  return BLOCKING_STATUSES.includes(status);
}
