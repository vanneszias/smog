import { DEFAULT_LOCALE, LOCALES, type Locale } from "@smog/config/constants";

export interface LocaleSources {
  /** Accept-Language header, e.g. `"fr-BE,fr;q=0.9"`. */
  acceptLanguage?: string | null;
  /** The locale cookie (web). */
  cookie?: string | null;
  /** Device locales in order of preference, e.g. from `expo-localization`. */
  device?: string | readonly string[] | null;
  /** An explicit choice stored on the device (local-store preferences). */
  preference?: string | null;
}

const TAG_SEPARATOR = /[-_]/;

/**
 * Whether `value` is one of `enabled` (the enabled languages of the `language`
 * table; the shipped ones while no data is at hand).
 */
export function isLocale(
  value: unknown,
  enabled: readonly string[] = LOCALES
): value is Locale {
  return typeof value === "string" && enabled.includes(value);
}

/**
 * Matches a language tag against `enabled`: the whole tag first (`pt-BR`),
 * then its primary subtag (`fr-BE` becomes `fr`).
 */
export function matchLocale(
  tag: string | null | undefined,
  enabled: readonly string[] = LOCALES
): Locale | null {
  const trimmed = tag?.trim().replaceAll("_", "-");
  if (!trimmed) {
    return null;
  }
  const whole = enabled.find(
    (code) => code.toLowerCase() === trimmed.toLowerCase()
  );
  if (whole) {
    return whole;
  }
  const primary = trimmed.split(TAG_SEPARATOR)[0]?.toLowerCase();
  return enabled.find((code) => code.toLowerCase() === primary) ?? null;
}

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { index, quality: Number.isNaN(quality) ? 0 : quality, tag };
    })
    .filter((entry) => entry.tag !== "" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}

function firstMatch(
  tags: readonly string[],
  enabled: readonly string[]
): Locale | null {
  for (const tag of tags) {
    const locale = matchLocale(tag, enabled);
    if (locale) {
      return locale;
    }
  }
  return null;
}

/**
 * Picks the UI locale: the stored preference, then the cookie, then
 * Accept-Language (by q-value), then the device locales, else the default.
 * Only `enabled` languages count (the `language` table's enabled rows; the
 * shipped three while none are passed), so a disabled or unknown language in
 * a cookie falls through to the next source.
 */
export function resolveLocale(
  sources: LocaleSources,
  enabled: readonly string[] = LOCALES,
  fallback: Locale = DEFAULT_LOCALE
): Locale {
  const device =
    typeof sources.device === "string" ? [sources.device] : sources.device;
  return (
    matchLocale(sources.preference, enabled) ??
    matchLocale(sources.cookie, enabled) ??
    firstMatch(parseAcceptLanguage(sources.acceptLanguage ?? ""), enabled) ??
    firstMatch(device ?? [], enabled) ??
    fallback
  );
}
