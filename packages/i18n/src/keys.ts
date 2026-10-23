import type { ParseKeys } from "i18next";
import type nl from "./locales/nl.json";

export const DEFAULT_NAMESPACE = "translation";

/**
 * The canonical (nl) catalogue shape; en and fr must match it. A type-only
 * import: no catalogue is in this module (phase 10b task 7b).
 */
export type Messages = typeof nl;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: { translation: Messages };
    returnNull: false;
  }
}

/** Every valid key, e.g. `"auth.errors.generic"` (plural suffixes stripped). */
export type TranslationKey = ParseKeys<typeof DEFAULT_NAMESPACE>;
