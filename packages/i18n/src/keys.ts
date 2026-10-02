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

/**
 * A plain `t` for helpers that take it as a parameter (`roleLabel(t, role)`).
 * i18next's `TFunction` resolves its return type against the whole catalogue
 * on a cold check, which TypeScript 7 stops at its instantiation limit once
 * the catalogue is this large (TS2589); this signature keeps the key check
 * and returns a `string`. Pass the hook's `t` to it unchanged.
 */
export type Translate = (
  key: TranslationKey,
  options?: Record<string, unknown>
) => string;
