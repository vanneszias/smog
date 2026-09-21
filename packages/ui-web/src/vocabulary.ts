/**
 * The names both component libraries answer to.
 *
 * Imported by `packages/ui-native`, which is why this module has no imports
 * of its own: it is read inside a React Native test runtime, where anything
 * reaching for React DOM does not load.
 *
 * Adding a name here without implementing it on both platforms fails two
 * test suites, which is the entire purpose.
 */
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
