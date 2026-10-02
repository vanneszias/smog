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

const zoneParts = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: TIME_ZONE,
  year: "numeric",
});

/** How far the product's time zone is ahead of UTC at `ms`. */
function zoneOffsetMs(ms: number): number {
  const parts = zoneParts.formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );
  return wall - Math.floor(ms / 1000) * 1000;
}

/** Midnight of a calendar day in the product's time zone (Date.UTC fields). */
function zonedMidnight(year: number, month: number, day: number): number {
  const guess = Date.UTC(year, month - 1, day);
  // Twice: the offset at midnight can differ from the offset at the guess.
  const first = guess - zoneOffsetMs(guess);
  return guess - zoneOffsetMs(first);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The first and the last millisecond of a calendar day (`YYYY-MM-DD`) in
 * the product's time zone, the one `formatDate` shows; `undefined` for
 * anything else. A daylight-saving day has 23 or 25 hours.
 */
export function dayRange(
  day: string
): { end: number; start: number } | undefined {
  if (!DAY.test(day)) {
    return;
  }
  const [year = 0, month = 0, date = 0] = day.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) {
    return;
  }
  return {
    end: zonedMidnight(year, month, date + 1) - 1,
    start: zonedMidnight(year, month, date),
  };
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
