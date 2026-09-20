export * from "./contrast";
export * from "./css";
export * from "./tokens";

import { tokens } from "./tokens";

/*
 * ---------------------------------------------------------------------------
 * Deprecated compatibility layer.
 *
 * `apps/native` still imports these flat React Native objects. They are now
 * derived from `tokens` rather than declared, so the two cannot drift; each one
 * is scheduled for removal in Stage 10, when the native app moves onto the
 * token object directly.
 * ---------------------------------------------------------------------------
 */

/**
 * @deprecated Use `tokens.color` / `tokens.semantic`. Removed in Stage 10.
 */
export const colors = {
  primary: tokens.color.brand.primary,
  secondary: tokens.color.brand.secondary,
  accent: tokens.color.brand.accent,
  warning: tokens.color.brand.warning,
  /*
   * Deliberately `white`, not `tokens.semantic.light.background`, which moved
   * to `neutral[100]` in Stage 3 so a white card reads against the page. That
   * is a decision about the *web* surfaces; this object is what `apps/native`
   * still paints its screens with, and `themes.light.background` below has
   * always been `white` outright. Following the semantic token here would
   * repaint a shipping app as a side effect of a web token change.
   */
  background: tokens.color.white,
  text: tokens.color.neutral[800],
  textLight: tokens.color.neutral[600],
  border: tokens.color.neutral[200],
  error: tokens.color.brand.error,
  shadow: tokens.color.brand.primary,
} as const;

/**
 * @deprecated Use `tokens.spacing`. Removed in Stage 10.
 */
export const SPACING = {
  xs: tokens.spacing.xs,
  sm: tokens.spacing.sm,
  md: tokens.spacing.md,
  lg: tokens.spacing.lg,
  xl: tokens.spacing.xl,
  xxl: tokens.spacing.xxl,
} as const;

/**
 * @deprecated Use `tokens.radius`. Removed in Stage 10.
 */
export const BORDER_RADIUS = {
  sm: tokens.radius.sm,
  md: tokens.radius.md,
  lg: tokens.radius.lg,
  xl: tokens.radius.xl,
  round: tokens.radius.full,
} as const;

/**
 * @deprecated Use `tokens.duration`. Removed in Stage 10.
 */
export const ANIMATION_DURATION = tokens.duration;

/**
 * @deprecated Use `tokens.fontSize`. Removed in Stage 10.
 */
export const FONT_SIZE = tokens.fontSize;

/**
 * @deprecated Use `tokens.fontWeight`. Removed in Stage 10.
 */
export const FONT_WEIGHT = tokens.fontWeight;

/**
 * @deprecated Use `tokens.iconSize`. Removed in Stage 10.
 */
export const ICON_SIZE = tokens.iconSize;

/**
 * @deprecated Native-only control height; moves into the native app in
 * Stage 10.
 */
export const SEARCHBAR_HEIGHT = 56;

/**
 * @deprecated Derive touch targets from `tokens.spacing`. Removed in Stage 10.
 */
export const HIT_SLOP = {
  sm: hitSlop(tokens.spacing[2]),
  md: hitSlop(tokens.spacing[3]),
  lg: hitSlop(tokens.spacing[4]),
} as const;

function hitSlop(inset: number) {
  return { top: inset, bottom: inset, left: inset, right: inset } as const;
}

/**
 * @deprecated Use `tokens.elevation` (cross-platform) or `tokens.shadow`
 * (web). Removed in Stage 10.
 */
export const SHADOWS = {
  small: nativeShadow(tokens.elevation.sm),
  medium: nativeShadow(tokens.elevation.md),
  large: nativeShadow(tokens.elevation.lg),
} as const;

function nativeShadow(
  step: (typeof tokens.elevation)[keyof typeof tokens.elevation]
) {
  return {
    shadowColor: tokens.color.brand.primary,
    shadowOffset: { width: 0, height: step.offsetY },
    shadowOpacity: step.opacity,
    shadowRadius: step.blur,
    elevation: step.level,
  } as const;
}

/**
 * @deprecated Use `tokens.semantic` plus the platform's own colour scheme
 * hook. Removed in Stage 10.
 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * @deprecated Use `keyof Tokens["semantic"]["light"]`. Removed in Stage 10.
 */
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  warning: string;
  background: string;
  card: string;
  text: string;
  textLight: string;
  border: string;
  error: string;
  liked: string;
  statusBar: "light" | "dark";
}

/** Not a brand colour — a native-only affordance colour, kept verbatim. */
const LIKED = "#FF3B7D";

/**
 * @deprecated Use `tokens.semantic.light` / `tokens.semantic.dark`. Each value
 * below is the nearest step on the new ramps to the colour this theme used
 * before the tokens existed. Removed in Stage 10.
 */
export const themes: Record<"light" | "dark", ThemeColors> = {
  light: {
    primary: tokens.color.brandScale.primary[600],
    secondary: tokens.color.brandScale.secondary[300],
    accent: tokens.color.brandScale.accent[500],
    warning: tokens.color.brandScale.warning[400],
    background: tokens.color.white,
    card: tokens.color.neutral[50],
    text: tokens.color.neutral[800],
    textLight: tokens.color.neutral[600],
    border: tokens.color.neutral[200],
    error: tokens.color.brandScale.error[500],
    liked: LIKED,
    statusBar: "dark",
  },
  dark: {
    primary: tokens.color.brandScale.primary[500],
    secondary: tokens.color.brandScale.secondary[600],
    accent: tokens.color.brandScale.accent[400],
    warning: tokens.color.brandScale.warning[400],
    background: tokens.color.neutral[950],
    card: tokens.color.neutral[900],
    text: tokens.color.neutral[50],
    textLight: tokens.color.neutral[300],
    border: tokens.color.neutral[700],
    error: tokens.color.brandScale.error[500],
    liked: LIKED,
    statusBar: "light",
  },
};
