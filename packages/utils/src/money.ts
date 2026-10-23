/** A language code; Belgian conventions (`nl-BE`) for the shipped ones, else the code itself. */
export type MoneyLocale = string;

const INTL_LOCALES: Record<string, string> = {
  en: "en-BE",
  fr: "fr-BE",
  nl: "nl-BE",
};

const formatters = new Map<MoneyLocale, Intl.NumberFormat>();

function formatter(locale: MoneyLocale): Intl.NumberFormat {
  let format = formatters.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(INTL_LOCALES[locale] ?? locale, {
      currency: "EUR",
      style: "currency",
    });
    formatters.set(locale, format);
  }
  return format;
}

/** Formats an amount in euro cents for the Belgian locale of `locale`. */
export function formatMoney(cents: number, locale: MoneyLocale): string {
  return formatter(locale).format(cents / 100);
}
