import { DEFAULT_LOCALE, LOCALES, type Locale } from "@smog/config/constants";
import { createInstance, type i18n } from "i18next";
import { DEFAULT_NAMESPACE, resources } from "./keys";

/**
 * Creates a fresh, synchronously initialised i18next instance for `locale`.
 * The site creates one per request (SSR, no browser detector: the locale
 * comes from `resolveLocale`) and passes it to `I18nextProvider`.
 */
export function createI18n(locale: Locale): i18n {
  const instance = createInstance();
  instance.init({
    defaultNS: DEFAULT_NAMESPACE,
    fallbackLng: DEFAULT_LOCALE,
    initAsync: false,
    interpolation: { escapeValue: false },
    lng: locale,
    ns: [DEFAULT_NAMESPACE],
    react: { useSuspense: false },
    resources,
    returnNull: false,
    supportedLngs: [...LOCALES],
  });
  return instance;
}
