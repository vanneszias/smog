/**
 * The names both component libraries answer to.
 *
 * Imported by `packages/ui-native`, which is why this module takes no import
 * that reaches React DOM: it is read inside a React Native test runtime,
 * where anything reaching for React DOM does not load. `@smog/config` is
 * safe — it declares no React dependency of its own — which is what lets
 * `SPONSORSHIP_STATUS_LABELS` live here rather than in
 * `packages/ui-web/src/domain/StatusBadge.tsx`, which does reach React DOM
 * through `Badge.tsx`.
 *
 * Adding a name here without implementing it on both platforms fails two
 * test suites, which is the entire purpose.
 */
import type { SponsorshipStatus } from "@smog/config";

export const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "outline",
  "ghost",
  "danger",
] as const;

export const BUTTON_SIZES = ["sm", "md", "lg", "icon"] as const;

export const BADGE_VARIANTS = [
  "neutral",
  "primary",
  "success",
  "warning",
  "danger",
  "outline",
] as const;

/** `Badge` has only two sizes on both platforms. `Button` has four. */
export const BADGE_SIZES = ["sm", "md"] as const;

export const INPUT_SIZES = ["sm", "md", "lg"] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = (typeof BUTTON_SIZES)[number];
export type BadgeVariant = (typeof BADGE_VARIANTS)[number];
export type BadgeSize = (typeof BADGE_SIZES)[number];
export type InputSize = (typeof INPUT_SIZES)[number];

/**
 * The Dutch label for each sponsorship status, in words a sponsor can read.
 *
 * Moved here from `packages/ui-web/src/domain/StatusBadge.tsx` (Task 6),
 * which still re-exports it under its old name so no call site changes.
 * `StatusBadge.tsx` reaches `Badge.tsx` and React DOM, so it cannot be the
 * home for a constant `packages/ui-native` also needs — this module is.
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
