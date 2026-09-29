import {
  createI18n,
  DEFAULT_LOCALE,
  isLocale,
  type TranslationKey,
} from "@smog/i18n";

interface MatchWithData {
  loaderData?: unknown;
}

/**
 * `<title>` (and `noindex` for private pages) in the page's language. The
 * root match's loader data is the shell, which carries the locale.
 */
export function pageMeta(
  matches: readonly MatchWithData[],
  key: TranslationKey,
  { index = false }: { index?: boolean } = {}
) {
  const data = matches[0]?.loaderData;
  const locale =
    typeof data === "object" &&
    data !== null &&
    "locale" in data &&
    isLocale(data.locale)
      ? data.locale
      : DEFAULT_LOCALE;
  const { t } = createI18n(locale);
  return {
    meta: [
      { title: `${t(key)} · ${t("common.appName")}` },
      ...(index ? [] : [{ content: "noindex", name: "robots" }]),
    ],
  };
}
