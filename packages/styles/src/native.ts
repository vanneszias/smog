import { vars } from "nativewind";
import { nativeThemeVariables } from "./native-variables";
import type { ThemeName } from "./tokens";

/** The opaque style object NativeWind's `vars()` returns. */
type ThemeStyle = ReturnType<typeof vars>;

/**
 * NativeWind `vars()` styles that set the colour variables of the preset
 * (`@smog/styles/tailwind-preset`). Apply the one for the current scheme on
 * the app's root view; everything below it resolves `bg-surface`,
 * `text-foreground`, … for that theme. Views mounted outside that tree
 * (native portals) must apply it again at their own root.
 */
export const themeVars: Readonly<Record<ThemeName, ThemeStyle>> = {
  dark: vars(nativeThemeVariables.dark),
  light: vars(nativeThemeVariables.light),
};
