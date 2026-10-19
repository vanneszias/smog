import { formatDate, type Locale } from "@smog/i18n";
import { formatMoney } from "@smog/utils";
import type { Translate } from "./types";

/**
 * The gesture in a sentence: "het gebaar ‘Hond’", or "je gebaar" when the
 * name is missing (bug 28: the old emails printed "undefined").
 */
export function gesturePhrase(t: Translate, name: string | null): string {
  return name
    ? t("email.common.gestureNamed", { name })
    : t("email.common.yourGesture");
}

/** The gesture as a value in a details row: the name, or "Je gebaar". */
export function gestureValue(
  t: Translate,
  locale: Locale,
  name: string | null
): string {
  if (name) {
    return name;
  }
  const phrase = t("email.common.yourGesture");
  return phrase.charAt(0).toLocaleUpperCase(locale) + phrase.slice(1);
}

/** An ISO 8601 date from a queue message, as a long date in Brussels. */
export function emailDate(iso: string, locale: Locale): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new RangeError(`[email] Not an ISO date: ${iso}`);
  }
  return formatDate(ms, locale);
}

/** Integer cents as euros in the locale's Belgian format. */
export function emailMoney(cents: number, locale: Locale): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`[email] Not an amount in cents: ${String(cents)}`);
  }
  return formatMoney(cents, locale);
}

const VAT_DIGITS = /^\d{10}$/;

/** A stored (10-digit) Belgian VAT number as "BE 0123.456.749". */
export function formatVatNumber(vatNumber: string): string {
  if (!VAT_DIGITS.test(vatNumber)) {
    return vatNumber;
  }
  return `BE ${vatNumber.slice(0, 4)}.${vatNumber.slice(4, 7)}.${vatNumber.slice(7)}`;
}

/** The render-failed email shows at most this much of the error. */
const ERROR_SUMMARY_MAX = 300;

/** At most `ERROR_SUMMARY_MAX` characters, never half a character. */
export function errorSummary(error: string): string {
  return Array.from(error.trim()).slice(0, ERROR_SUMMARY_MAX).join("");
}
