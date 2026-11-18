import { seoHead, shellHead } from "@/lib/head";

/*
 * The head and search validation of `/privacy` and `/terms`, kept apart
 * from `legal-page.tsx` on purpose: a route's `head` and `validateSearch`
 * stay in its entry-reachable chunk, so importing the page from here would
 * load it on every page (phase 9 task 6). The texts come from D1 through
 * the route's `loader` (`getLegalTexts`, a server function), and the head
 * reads the meta the loader derived (`legalMeta` in `legal-page.tsx`).
 */

/** `/privacy` or `/terms`. */
export type LegalHeadKind = "privacy" | "terms";

/**
 * `/privacy?text=nl`: the Dutch text in place, whatever the site language.
 * (`?lang` is the page's language on every public page,
 * `lib/page-language.ts`; this one keeps the page as it is.)
 */
export interface LegalSearch {
  text?: "nl";
}

/** A page's title and description in one language. */
interface LegalMeta {
  description: string;
  title: string;
}

/** What the route loader derives: title and description per language it loaded. */
export type LegalMetaByLocale = Readonly<Record<string, LegalMeta>>;

/** Keeps only `text=nl` (review I2: reading Dutch changes no setting). */
export function validateLegalSearch(
  search: Record<string, unknown>
): LegalSearch {
  return search.text === "nl" ? { text: "nl" } : {};
}

/**
 * The page head: the published text's title, a fixed plain-language
 * description per page (`meta.privacy` / `meta.terms`; the text's first
 * paragraph was formal and far over the length a result shows), canonical.
 */
export function legalHead(
  matches: Parameters<typeof shellHead>[0],
  kind: LegalHeadKind,
  meta: LegalMetaByLocale | undefined
) {
  const { locale, t } = shellHead(matches);
  const own = meta?.[locale];
  return seoHead(matches, {
    description: t(
      kind === "privacy" ? "meta.privacy.description" : "meta.terms.description"
    ),
    path: `/${kind}`,
    ...(own ? { title: own.title } : {}),
  });
}
