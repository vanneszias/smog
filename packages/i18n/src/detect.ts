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

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/** Matches a language tag on its primary subtag (`fr-BE` → `fr`). */
export function matchLocale(tag: string | null | undefined): Locale | null {
  const primary = tag?.trim().split(TAG_SEPARATOR)[0]?.toLowerCase();
  return isLocale(primary) ? primary : null;
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

function firstMatch(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const locale = matchLocale(tag);
    if (locale) {
      return locale;
    }
  }
  return null;
}

/**
 * Picks the UI locale: the stored preference, then the cookie, then
 * Accept-Language (by q-value), then the device locales, else `nl`.
 */
export function resolveLocale(sources: LocaleSources): Locale {
  const device =
    typeof sources.device === "string" ? [sources.device] : sources.device;
  return (
    matchLocale(sources.preference) ??
    matchLocale(sources.cookie) ??
    firstMatch(parseAcceptLanguage(sources.acceptLanguage ?? "")) ??
    firstMatch(device ?? []) ??
    DEFAULT_LOCALE
  );
}
