import { availableLocales } from "@smog/i18n";

/**
 * The three locales `apps/site`'s Payload config declares
 * (`payload.config.ts`'s `localization.locales`), re-typed from
 * `@smog/i18n`'s own `availableLocales` rather than a second hardcoded
 * union — the two must never drift, and this is what makes that a
 * type error instead of a runtime surprise.
 */
export type Locale = (typeof availableLocales)[number];

/**
 * `payload.config.ts` sets `defaultLocale: "nl"`. Every request this app
 * makes carries a locale, and this is what it carries when nothing more
 * specific is known.
 */
export const DEFAULT_LOCALE: Locale = "nl";

function languageSubtag(tag: string): string {
  return (tag.split("-")[0] ?? "").toLowerCase();
}

function isSupportedLocale(language: string): language is Locale {
  return (availableLocales as readonly string[]).includes(language);
}

/**
 * The first of `tags` (as `expo-localization`'s `getLocales()` returns them,
 * most-preferred first) whose language subtag Payload supports, or
 * `DEFAULT_LOCALE` when none is.
 *
 * Deliberately a loop that tests each tag in turn, not "validate the first
 * tag, else fall back": a reader whose most-preferred language this app
 * does not support but whose second choice it does (`["de-DE", "fr-FR"]`)
 * gets French, not Dutch.
 */
export function resolveLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const language = languageSubtag(tag);

    if (isSupportedLocale(language)) {
      return language;
    }
  }

  return DEFAULT_LOCALE;
}
