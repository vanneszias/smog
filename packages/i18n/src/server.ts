/**
 * The runtime catalogue on the Worker (phase 10b ruling 1): the languages
 * and the `ui_string` overlay, read from D1 once per isolate and version.
 *
 * The version is the KV key `i18n:version`, bumped by every write to
 * `language` or `ui_string` (`bumpI18nVersion`, the translation screens, an
 * import), like `catalog:version` for the gesture catalogue. It is read with
 * a 30 s `cacheTtl` (KV's minimum), so an edit reaches every isolate within
 * KV's propagation delay plus that half minute, without a deploy. A D1 write
 * without a bump (a manual `wrangler d1 execute`) stays invisible until the
 * isolate is recycled.
 *
 * Reads never write KV (a missing key is `INITIAL_I18N_VERSION`) and never
 * fail the page: when KV or D1 throws, the shipped languages and no overlay
 * are used (logged), so the shipped base always renders. Only resolved plain
 * data is shared between requests, never a promise (a request's I/O must not
 * be awaited by another in workerd).
 *
 * Pure: the D1 queries are injected (`CatalogueSource`, `@smog/db`'s
 * `uiCatalogueSource`), so this runs in bun tests with fakes.
 */
import { DEFAULT_LOCALE, type Locale } from "@smog/config/constants";
import { type CatalogueOverlay, pickOverlay } from "./catalogue";
import {
  defaultLanguage,
  type LanguageInfo,
  languageCodes,
  registerLanguages,
  SHIPPED_LANGUAGES,
} from "./languages";

export const I18N_VERSION_KEY = "i18n:version";
/** The version while no writer has bumped it yet. */
export const INITIAL_I18N_VERSION = "initial";
/** KV's edge cache for the version key, in seconds (KV's minimum). */
const VERSION_CACHE_TTL = 30;

/** The two KV calls this module makes (`KVNamespace` satisfies it). */
export interface CatalogueKv {
  get: (key: string, options: { cacheTtl: number }) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
}

/** Where the data comes from (D1 in the Worker). */
export interface CatalogueSource {
  /** Enabled languages in menu order, the default one among them. */
  languages: () => Promise<readonly LanguageInfo[]>;
  /** The `ui_string` rows of one language as flat key to value. */
  strings: (locale: Locale) => Promise<Readonly<Record<string, string>>>;
}

export interface LoadedCatalogue {
  /** The enabled languages (the language menu). */
  languages: readonly LanguageInfo[];
  /** The resolved language: one of `languages`, never an unknown code. */
  locale: Locale;
  /** The overlay rows of `locale` and the default language only. */
  overlay: CatalogueOverlay;
  version: string;
}

interface Cached {
  languages: readonly LanguageInfo[];
  overlays: Map<Locale, Readonly<Record<string, string>>>;
  version: string;
}

let cached: Cached | null = null;

/** Starts a new i18n version (a fresh id, so concurrent bumps cannot leave a stale one). */
export async function bumpI18nVersion(kv: CatalogueKv): Promise<string> {
  const version = crypto.randomUUID();
  try {
    await kv.put(I18N_VERSION_KEY, version);
    return version;
  } catch (error) {
    console.error("[i18n] Failed to bump the i18n version:", error);
    throw error;
  }
}

/** Forgets the isolate's cache (tests). */
export function resetCatalogueCache(): void {
  cached = null;
}

async function readVersion(kv: CatalogueKv): Promise<string> {
  return (
    (await kv.get(I18N_VERSION_KEY, { cacheTtl: VERSION_CACHE_TTL })) ??
    INITIAL_I18N_VERSION
  );
}

async function loadRows(
  source: CatalogueSource,
  version: string,
  locales: readonly Locale[]
): Promise<Cached> {
  const hit = cached?.version === version ? cached : null;
  const languages = hit?.languages ?? (await source.languages());
  const overlays = hit?.overlays ?? new Map();
  const missing = locales.filter((locale) => !overlays.has(locale));
  const loaded = await Promise.all(
    missing.map((locale) => source.strings(locale))
  );
  for (const [index, locale] of missing.entries()) {
    overlays.set(locale, loaded[index] ?? {});
  }
  const next = { languages, overlays, version };
  cached = next;
  return next;
}

/**
 * The catalogue for one request: the enabled languages, the language
 * `resolve` picks from them (cookie, account, Accept-Language: it gets the
 * enabled codes and the default), and the overlay of that language and the
 * default one. One KV read, at most two D1 reads per isolate and version.
 */
export async function loadCatalogue(
  { kv, source }: { kv: CatalogueKv; source: CatalogueSource },
  resolve: (enabled: readonly string[], fallback: Locale) => Locale
): Promise<LoadedCatalogue> {
  try {
    const version = await readVersion(kv);
    const languages =
      cached?.version === version
        ? cached.languages
        : (await loadRows(source, version, [])).languages;
    const fallback = defaultLanguage(languages);
    const locale = resolve(languageCodes(languages), fallback);
    const wanted = [...new Set([locale, fallback])];
    const rows = await loadRows(source, version, wanted);
    registerLanguages(rows.languages);
    const overlays: Record<Locale, Readonly<Record<string, string>>> = {};
    for (const code of wanted) {
      overlays[code] = rows.overlays.get(code) ?? {};
    }
    return {
      languages: rows.languages,
      locale,
      overlay: pickOverlay(overlays, wanted),
      version,
    };
  } catch (error) {
    console.error("[i18n] Failed to load the catalogue:", error);
    // The shipped base: shipped languages, no overlay.
    return {
      languages: SHIPPED_LANGUAGES,
      locale: resolve(languageCodes(SHIPPED_LANGUAGES), DEFAULT_LOCALE),
      overlay: {},
      version: INITIAL_I18N_VERSION,
    };
  }
}
