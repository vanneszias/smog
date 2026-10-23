import type { ShippedLocale } from "@smog/config/constants";
import type { Messages } from "./keys";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import nl from "./locales/nl.json";
import { registerCatalogue } from "./store";

/**
 * All three shipped catalogues, registered as a side effect of importing
 * this module. The full entry (`@smog/i18n`) imports it, so the Worker, the
 * tests, the scripts and the mobile app have every language at once; the
 * site's browser build swaps the entry for `index.lazy.ts` and loads one
 * language at a time (apps/site/vite.config.ts).
 */
export const resources = {
  en: { translation: en },
  fr: { translation: fr },
  nl: { translation: nl },
} as const satisfies Record<ShippedLocale, { translation: Messages }>;

for (const [locale, { translation }] of Object.entries(resources)) {
  registerCatalogue(locale, translation);
}
