import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  type ShippedLocale,
} from "@smog/config/constants";

export interface MessageTree {
  [key: string]: string | MessageTree;
}

/**
 * The shipped catalogues the runtime holds, by language (phase 10b task 7b).
 * Nothing here imports a catalogue statically: the Worker, the tests and
 * the mobile app fill it at once (`./shipped`), the browser one language at
 * a time (`loadCatalogue`), so the entry carries only the active language.
 */
const loaded = new Map<string, MessageTree>();

/** One dynamic import per shipped language: each is its own chunk in a web build. */
const LOADERS: Record<ShippedLocale, () => Promise<{ default: unknown }>> = {
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
  nl: () => import("./locales/nl.json"),
};

/** Whether `locale` ships a catalogue (the three of `LOCALES`), loaded or not. */
export function isShippedLocale(locale: Locale): boolean {
  return (LOCALES as readonly string[]).includes(locale);
}

/** Makes `messages` the shipped catalogue of `locale`. */
export function registerCatalogue(locale: Locale, messages: unknown): void {
  loaded.set(locale, messages as MessageTree);
}

/** The shipped catalogue of `locale` if it is loaded, else `undefined`. */
export function loadedCatalogue(locale: Locale): MessageTree | undefined {
  return loaded.get(locale);
}

/** Whether the shipped catalogue of `locale` is in memory. */
export function isCatalogueLoaded(locale: Locale): boolean {
  return loaded.has(locale);
}

/** Loads the shipped catalogue of `locale` (a no-op for one that is loaded or not shipped). */
export async function loadCatalogue(locale: Locale): Promise<void> {
  if (loaded.has(locale) || !isShippedLocale(locale)) {
    return;
  }
  const module = await LOADERS[locale as ShippedLocale]();
  registerCatalogue(locale, module.default);
}

/**
 * What a render in `locale` needs in memory: its own shipped catalogue, and
 * the default language's one only for a language without a shipped
 * catalogue (an overlay-only one), whose missing keys fall back to it.
 * Await it before `createI18n` in the browser (the root loader, the client
 * entry, a language change).
 */
export async function ensureCatalogues(locale: Locale): Promise<void> {
  await loadCatalogue(locale);
  if (!isShippedLocale(locale)) {
    await loadCatalogue(DEFAULT_LOCALE);
  }
}
