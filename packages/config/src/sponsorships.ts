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

/**
 * The Dutch label for each sponsorship status, in words a sponsor can read.
 *
 * Lives here, alongside `SPONSORSHIP_STATUSES` itself, rather than in
 * `packages/ui-web/src/vocabulary.ts` (its home through Task 6): both
 * `packages/ui-web` and `packages/ui-native` need these strings at runtime,
 * and a runtime `dependencies` edge from the native library to the web one
 * would contradict the reason `packages/ui-native` exists — the two share a
 * philosophy, not code. `@smog/config` has no runtime dependency of its own
 * (no React anywhere in its tree), which is what already lets it be the
 * shared home for the status list; the labels belong next to it for the
 * same reason. `packages/ui-web/src/vocabulary.ts` re-exports this under its
 * old name so no existing call site changes.
 */
export const SPONSORSHIP_STATUS_LABELS: Record<SponsorshipStatus, string> = {
  pending_payment: "Wacht op betaling",
  pending_approval: "Wacht op goedkeuring",
  pending_resubmission: "Wacht op aanpassing",
  active: "Actief",
  expired: "Verlopen",
  rejected: "Afgewezen",
  cancelled: "Geannuleerd",
};
