import { uiCatalogueSource } from "@smog/db";
import { createDb } from "@smog/db/client";
import type { CatalogueOverlay, Locale } from "@smog/i18n";
import {
  type CatalogueDeps,
  type LoadedCatalogue,
  loadCatalogue,
  loadLanguages,
} from "@smog/i18n/server";
import { siteEnv } from "./auth";

/** The KV version, the D1 queries and the isolate cache of the runtime catalogue (`@smog/i18n/server`). */
export function catalogueDeps(): CatalogueDeps {
  const { db, kv } = siteEnv();
  return { kv, source: uiCatalogueSource(createDb(db)) };
}

/** The codes of the enabled languages: what a cookie, a header or an account may name. */
export async function enabledLanguageCodes(): Promise<string[]> {
  return (await loadLanguages(catalogueDeps())).map(
    (language) => language.code
  );
}

/** The languages, the resolved one and the overlay rows of it and the default language. */
export function loadSiteCatalogue(
  resolve: (enabled: readonly string[], fallback: Locale) => Locale
): Promise<LoadedCatalogue> {
  return loadCatalogue(catalogueDeps(), resolve);
}

/**
 * The overlay an email in `locale` renders with (the email queue's consumer
 * and the dev fallback). A language that is not enabled any more reads the
 * default language's.
 */
export async function emailOverlay(locale: Locale): Promise<CatalogueOverlay> {
  const { overlay } = await loadSiteCatalogue((enabled, fallback) =>
    enabled.includes(locale) ? locale : fallback
  );
  return overlay;
}
