import { DEFAULT_LOCALE, isLocale, type Locale } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";

/** The page's language, for `formatMoney` and `formatDate` (nl-BE, en-BE, fr-BE). */
export function usePageLocale(): Locale {
  const { i18n } = useTranslation();
  return isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
}
