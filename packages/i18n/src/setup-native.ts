import { getLocales } from "expo-localization";
import type { i18n } from "i18next";
import { resolveLocale } from "./detect";
import { createI18n } from "./setup-web";

export interface SetupNativeOptions {
  /** The locale the user picked, from local-store preferences. */
  preference?: string | null;
}

/**
 * Creates the app's i18next instance: the stored preference, else the first
 * supported device locale (`expo-localization`), else `nl`.
 */
export function setupNative({ preference }: SetupNativeOptions = {}): i18n {
  const device = getLocales().map((locale) => locale.languageTag);
  return createI18n(resolveLocale({ device, preference }));
}
