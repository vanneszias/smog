import { DEFAULT_LOCALE, type Locale } from "@smog/config/constants";

/** One row of the `language` table, as the menus and `Intl` need it. */
export interface LanguageInfo {
  code: Locale;
  /** What `Intl` formats dates and lists with (`nl-BE`). */
  intlTag: string;
  isDefault: boolean;
  /** The language's own name ("Nederlands"). */
  name: string;
}

/**
 * The shipped languages, the seed of the `language` table (migration 0015).
 * Used where no data can be read (a failed D1 or KV read, a test, the
 * mobile app before its first fetch): the shipped base always works.
 */
export const SHIPPED_LANGUAGES: readonly LanguageInfo[] = [
  { code: "nl", intlTag: "nl-BE", isDefault: true, name: "Nederlands" },
  { code: "en", intlTag: "en-BE", isDefault: false, name: "English" },
  { code: "fr", intlTag: "fr-BE", isDefault: false, name: "Français" },
];

const registered = new Map<string, string>(
  SHIPPED_LANGUAGES.map((language) => [language.code, language.intlTag])
);

/**
 * Makes `INTL_LOCALE` data: remembers each language's `Intl` tag, so
 * `formatDate` and `formatList` follow `language.intl_tag`. Called where a
 * language list is loaded (the Worker, the root route, the mobile app).
 */
export function registerLanguages(languages: readonly LanguageInfo[]): void {
  for (const language of languages) {
    registered.set(language.code, language.intlTag);
  }
}

/** The `Intl` tag of a language; the code itself when it is not registered. */
export function intlTag(locale: Locale): string {
  return registered.get(locale) ?? locale;
}

/** The codes of the languages in `languages`. */
export function languageCodes(languages: readonly LanguageInfo[]): string[] {
  return languages.map((language) => language.code);
}

/** The default language's code (the one flagged), else the shipped default. */
export function defaultLanguage(languages: readonly LanguageInfo[]): Locale {
  return (
    languages.find((language) => language.isDefault)?.code ?? DEFAULT_LOCALE
  );
}
