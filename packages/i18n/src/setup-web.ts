import { DEFAULT_LOCALE, type Locale } from "@smog/config/constants";
import { createInstance, type i18n } from "i18next";
import { buildResources, type CatalogueOverlay } from "./catalogue";
import { DEFAULT_NAMESPACE } from "./keys";

/**
 * Creates a fresh, synchronously initialised i18next instance for `locale`.
 * The site creates one per request (SSR, no browser detector: the locale
 * comes from `resolveLocale`) and passes it to `I18nextProvider`.
 *
 * The messages are the shipped catalogue with the `overlay` (the
 * `ui_string` rows) on top, for `locale` and the default language. A key
 * missing in `locale` resolves in the default language; an empty value
 * counts as missing (`returnEmptyString: false`), so a string never renders
 * empty. A language that ships no catalogue (one an admin added) is the
 * overlay alone, over the default language.
 */
export function createI18n(
  locale: Locale,
  overlay: CatalogueOverlay = {}
): i18n {
  const instance = createInstance();
  instance.init({
    defaultNS: DEFAULT_NAMESPACE,
    fallbackLng: DEFAULT_LOCALE,
    initAsync: false,
    interpolation: { escapeValue: false },
    lng: locale,
    ns: [DEFAULT_NAMESPACE],
    react: { useSuspense: false },
    resources: buildResources(locale, overlay),
    returnEmptyString: false,
    returnNull: false,
  });
  return instance;
}

/**
 * The `t` function, for code that passes it around (helpers, templates,
 * label maps). Never type it from the hook
 * (`ReturnType<typeof useTranslation>["t"]`): that makes TypeScript
 * instantiate the whole key union and fails with TS2589 once the catalogue
 * is large. `translate-type.test.ts` enforces it (DECISIONS, phase 5 task 3).
 */
export type Translate = ReturnType<typeof createI18n>["t"];
