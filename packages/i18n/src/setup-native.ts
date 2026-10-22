import { getLocales } from "expo-localization";
import type { i18n } from "i18next";
import type { CatalogueOverlay } from "./catalogue";
import { resolveLocale } from "./detect";
import { createI18n } from "./setup-web";

export interface SetupNativeOptions {
  /**
   * The enabled languages (`system.i18n`, cached on the device); the shipped
   * ones until the first answer, so the app always starts from its bundle.
   */
  enabled?: readonly string[];
  /** The `ui_string` overlay of the active and the default language (`system.i18n`); none offline. */
  overlay?: CatalogueOverlay;
  /** The locale the user picked, from local-store preferences. */
  preference?: string | null;
}

/** The device's languages in order of preference (`fr-BE`, `en-US`, ...). */
export function deviceLocaleTags(): string[] {
  return getLocales().map((locale) => locale.languageTag);
}

/**
 * Creates the app's i18next instance: the stored preference, else the first
 * enabled device locale (`expo-localization`), else `nl`, over the shipped
 * catalogue with the cached overlay on top.
 */
export function setupNative({
  enabled,
  overlay,
  preference,
}: SetupNativeOptions = {}): i18n {
  return createI18n(
    resolveLocale({ device: deviceLocaleTags(), preference }, enabled),
    overlay
  );
}
