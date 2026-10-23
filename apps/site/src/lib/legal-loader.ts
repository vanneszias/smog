import { ensureCatalogues } from "@smog/i18n";
import {
  LEGAL_CANONICAL_LOCALE,
  type LegalKind,
} from "@smog/i18n/legal/markup";
import type { LegalMetaByLocale, LegalSearch } from "@/components/legal-head";
import { getLegalTexts, type LegalTexts } from "@/server/legal.functions";

/** What `/privacy` and `/terms` load: the published texts and the head's title and description per language. */
export interface LegalLoaderData {
  meta: LegalMetaByLocale;
  texts: LegalTexts;
}

/**
 * What the loader reads from the router: its dependencies and the root
 * route's match (the language the root resolved from the cookie, the
 * account and the browser). Spelled out, not inferred, so the route's
 * `loaderData` types do not depend on the order of the route's keys.
 */
export interface LegalLoaderArgs {
  deps: LegalSearch;
  parentMatchPromise: Promise<{ loaderData?: { locale: string } | undefined }>;
}

/** The loader dependencies: only `?lang=nl` changes what the page loads. */
export function legalDeps({ search }: { search: LegalSearch }): LegalSearch {
  return search.lang ? { lang: search.lang } : {};
}

/**
 * The loader of one legal route: the site language and, for `?lang=nl`, the
 * Dutch text, read from D1 on the server (cached with the i18n version, so a
 * published edit shows without a deploy). The page code (`legal-page`) loads
 * on demand: it stays out of every other page.
 */
export function legalLoader(
  kind: LegalKind
): (args: LegalLoaderArgs) => Promise<LegalLoaderData> {
  return async ({ deps, parentMatchPromise }) => {
    const root = await parentMatchPromise;
    const locale = root.loaderData?.locale ?? "nl";
    const locales = deps.lang ? [...new Set([locale, deps.lang])] : [locale];
    const [texts] = await Promise.all([
      getLegalTexts({ data: { kind, locales } }),
      // The page labels itself in the text's language and the notice in Dutch: the browser holds only the active catalogue.
      ...[...new Set([...locales, LEGAL_CANONICAL_LOCALE])].map(
        ensureCatalogues
      ),
    ]);
    const { legalMeta } = await import("@/components/legal-page");
    return { meta: legalMeta(texts), texts };
  };
}
