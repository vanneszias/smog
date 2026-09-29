import { themeVars } from "@smog/styles/native";
import {
  type ColorRole,
  type ElevationLevel,
  type NativeShadow,
  nativeShadow,
  type ThemeName,
  tokens,
} from "@smog/styles/tokens";
import { useColorScheme } from "nativewind";

/** The active scheme; light until NativeWind knows it (same as ThemeRoot). */
export function useThemeName(): ThemeName {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? "dark" : "light";
}

/**
 * A colour role as a value, for props that take a colour instead of a class
 * (icons, `Switch` tracks, `ActivityIndicator`, placeholders, SVG).
 */
export function useColor(role: ColorRole): string {
  return tokens.color[useThemeName()][role];
}

/**
 * The colour variables for the active scheme. Overlays (modals, sheets)
 * mount outside the app's ThemeRoot and apply them again at their root.
 */
export function useThemeVars(): (typeof themeVars)[ThemeName] {
  return themeVars[useThemeName()];
}

/** The native shadow of an elevation level in the active scheme. */
export function useShadow(level: ElevationLevel): NativeShadow {
  return nativeShadow(level, useThemeName());
}

/** Extra touch area that brings a control of `size` pt up to 44 × 44. */
export function hitSlopFor(size: number): number {
  return Math.max(0, Math.ceil((tokens.touchTarget - size) / 2));
}

/** Text tones shared by Text and Heading (as web). */
export const toneText = {
  danger: "text-danger-strong",
  default: "text-foreground",
  muted: "text-foreground-muted",
  primary: "text-primary-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
} as const;
