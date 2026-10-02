import type { Locale } from "@smog/config/constants";
import type { ParseKeys } from "i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import nl from "./locales/nl.json";

export const DEFAULT_NAMESPACE = "translation";

/** The canonical (nl) catalogue shape; en and fr must match it. */
export type Messages = typeof nl;

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
  nl: { translation: nl },
} as const satisfies Record<Locale, { translation: Messages }>;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: { translation: Messages };
    returnNull: false;
  }
}

/** Every valid key, e.g. `"auth.errors.generic"` (plural suffixes stripped). */
export type TranslationKey = ParseKeys<typeof DEFAULT_NAMESPACE>;
