/**
 * The names both component libraries answer to.
 *
 * Historically this module took no import that reached React DOM, because
 * `packages/ui-native` imported it directly and a React Native test runtime
 * cannot load anything that does. `SPONSORSHIP_STATUS_LABELS` has since
 * moved to `@smog/config` itself (alongside `SPONSORSHIP_STATUSES`, which
 * already lived there) for a stricter reason than "it happens not to reach
 * React DOM today": `packages/ui-native` existing at all is the choice that
 * the two component libraries share a philosophy and not code, and a
 * runtime `dependencies` edge from the native library onto the web one
 * contradicts that regardless of what the web library's module graph
 * currently contains. Re-exported here under its old name so no existing
 * call site in this package changes.
 */
export { SPONSORSHIP_STATUS_LABELS } from "@smog/config";

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
