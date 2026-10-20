import type { Locale } from "@smog/config/constants";
import { seoHead, shellHead } from "@/lib/head";

/*
 * The head and search validation of `/privacy` and `/terms`, kept apart
 * from `legal-page.tsx` on purpose: a route's `head` and `validateSearch`
 * stay in its entry-reachable chunk, so importing the page (and with it
 * the three legal texts, ~21 kB gzip) from here would load them on every
 * page (phase 9 task 6). The texts reach the head through the route's
 * lazy `loader` instead (`legalMeta` in `legal-page.tsx`).
 */

/** `/privacy` or `/terms`. */
export type LegalHeadKind = "privacy" | "terms";

/** `/privacy?lang=nl`: the Dutch text in place, whatever the site language. */
export interface LegalSearch {
  lang?: "nl";
}

/** A page's title and description in one language. */
export interface LegalMeta {
  description: string;
  title: string;
}

/** What the route loader returns: every language, a few lines each. */
export type LegalMetaByLocale = Readonly<Record<Locale, LegalMeta>>;

/** Keeps only `lang=nl` (review I2: reading Dutch changes no setting). */
export function validateLegalSearch(
  search: Record<string, unknown>
): LegalSearch {
  return search.lang === "nl" ? { lang: "nl" } : {};
}

/** The page head: title, the first paragraph as description, canonical. */
export function legalHead(
  matches: Parameters<typeof shellHead>[0],
  kind: LegalHeadKind,
  meta: LegalMetaByLocale | undefined
) {
  const { locale, t } = shellHead(matches);
  const own = meta?.[locale];
  return seoHead(matches, {
    description: own?.description ?? t("common.appName"),
    path: `/${kind}`,
    ...(own ? { title: own.title } : {}),
  });
}
