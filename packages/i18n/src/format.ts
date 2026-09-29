import type { Locale } from "@smog/config/constants";
import { resources } from "./keys";

/** Intl locales per UI locale (Belgian conventions for dates and lists). */
const INTL_LOCALE: Record<Locale, string> = {
  en: "en-BE",
  fr: "fr-BE",
  nl: "nl-BE",
};

/** The product's time zone, so server (UTC) and device render the same day. */
const TIME_ZONE = "Europe/Brussels";

/** Formats a timestamp (integer ms). Defaults to a long date, e.g. "30 september 2026". */
export function formatDate(
  ms: number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "long" }
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: TIME_ZONE,
    ...options,
  }).format(ms);
}

/** Joins items as a conjunction ("a, b en c"), also where `Intl.ListFormat` is missing. */
export function formatList(items: readonly string[], locale: Locale): string {
  if (typeof Intl.ListFormat === "function") {
    return new Intl.ListFormat(INTL_LOCALE[locale], {
      style: "long",
      type: "conjunction",
    }).format(items);
  }
  const { and } = resources[locale].translation.common;
  return items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;
}
