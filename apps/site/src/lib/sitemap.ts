import type { MetadataRoute } from "next";
import type { Payload } from "payload";
import { LOCALES } from "./locale";

/**
 * The locale-prefixed paths that exist for every locale and are worth
 * crawling.
 *
 * `"" `is the locale root and `"/gestures"` is the list. **`/favorites` is
 * deliberately absent**: it carries `robots: { index: false }` (see
 * `app/(frontend)/[locale]/favorites/page.tsx`) because its contents live in
 * one reader's browser and a crawler would index the empty state as the
 * page. Listing a page in the sitemap and telling robots not to index it are
 * contradictory instructions, and Google reports the pair as an error rather
 * than picking one — so the two files have to agree, and
 * `sitemap.test.ts` pins that they do.
 */
const SITEMAP_PATHS = ["", "/gestures"] as const;

/**
 * How many gestures one `payload.find` may ask for.
 *
 * Not a tuning knob — a limit imposed by D1. An unbounded read (`limit: 0`)
 * of a *localized* collection issues a second statement binding one parameter
 * per row to fetch the translations, and D1 caps how many a statement may
 * bind: `apps/site/README.md` records the local test database tipping over at
 * roughly 180 rows with `D1_ERROR: too many SQL variables`. The sitemap is
 * the one query in the app that legitimately wants every row, so it pages
 * instead, and `select` below keeps the localized statement out of it as
 * well. Either alone would do; the sitemap is worth both, because it breaks
 * quietly — nobody notices a missing sitemap until traffic drops.
 */
const SITEMAP_PAGE_SIZE = 50;

/**
 * A ceiling on the paging loop, at {@link SITEMAP_PAGE_SIZE} rows each.
 *
 * 10,000 gestures against a catalogue of a few hundred. It exists so a bug in
 * the loop condition cannot spin against the database forever; it is not a
 * product limit, and crossing it logs rather than passing silently — a
 * truncated sitemap is a de-indexing event, and 50,000 URLs is the format's
 * own per-file limit, which this would reach first.
 */
const SITEMAP_MAX_PAGES = 200;

/** The columns the sitemap needs from a gesture. */
export interface SitemapGesture {
  id: number | string;
  updatedAt?: string | null;
}

/** `https://example.com/` and `https://example.com` must not differ. */
function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/**
 * The same document in every locale, as absolute URLs.
 *
 * Every locale is path-prefixed, including the default, so each entry is a
 * real URL rather than a bare-root special case — the same rule
 * `generateMetadata` on the detail page follows.
 */
function languageAlternates(
  origin: string,
  path: string
): Record<string, string> {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, `${origin}/${locale}${path}`])
  );
}

/**
 * The sitemap as data, given an origin and the rows to list.
 *
 * Separate from the query so the shape can be tested without a database and
 * the query can be tested without asserting on XML. Typed as Next's own
 * `MetadataRoute.Sitemap` — verified against
 * `node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts` in
 * 16.3.3, where `alternates.languages` is the only alternates key — so that
 * moving this back behind a `sitemap.ts` later needs no reshaping.
 *
 * Each gesture appears once per locale, with `alternates` pointing at its
 * other two. That is what tells a crawler the three URLs are translations of
 * one page rather than duplicates of it.
 */
export function sitemapEntries(
  origin: string,
  gestures: readonly SitemapGesture[]
): MetadataRoute.Sitemap {
  const base = normalizeOrigin(origin);
  const entries: MetadataRoute.Sitemap = [];

  for (const path of SITEMAP_PATHS) {
    for (const locale of LOCALES) {
      entries.push({
        alternates: { languages: languageAlternates(base, path) },
        url: `${base}/${locale}${path}`,
      });
    }
  }

  for (const gesture of gestures) {
    const path = `/gestures/${gesture.id}`;

    for (const locale of LOCALES) {
      entries.push({
        alternates: { languages: languageAlternates(base, path) },
        /*
         * Omitted rather than faked when absent: `<lastmod>` is a claim about
         * the document, and an invented one teaches a crawler to ignore the
         * field. `undefined` drops it; a `null` would render "null".
         */
        lastModified: gesture.updatedAt ?? undefined,
        url: `${base}/${locale}${path}`,
      });
    }
  }

  return entries;
}

/**
 * Every gesture the public may see, read as an anonymous visitor.
 *
 * **`overrideAccess: false` with no `user` is the whole point of this
 * function.** It makes `publicReadActive` run, so an inactive gesture cannot
 * reach the sitemap — a sitemap is a public list of URLs, and an entry for a
 * gesture the site then 404s is both a crawl error and a disclosure that the
 * row exists. The explicit `where` says the same thing a second time, for the
 * reason `fetchGestures` gives: the query stays correct the day someone
 * loosens the access rule for an unrelated reason.
 *
 * Deliberately no `user` argument, even though the caller could have one.
 * The sitemap is the anonymous view of the site by definition; handing it an
 * admin would make `publicReadActive` return `true` and publish every
 * inactive gesture to whoever happened to be signed in when the crawler's
 * copy was generated.
 *
 * `select` narrows the read to `updatedAt` — nothing else is rendered — which
 * also keeps the localized fields, and their extra bound-parameter-hungry
 * statement, out of the query entirely.
 *
 * The instance is a parameter rather than `getPayloadClient()`, and that is a
 * bundle decision too. The caller is a Payload endpoint registered in
 * `payload.config.ts`, so importing `payloadClient.ts` here would make the
 * config dynamically import itself; measured against this commit, that cycle
 * cost **+27.92 KiB gzipped** versus **+5.06 KiB** for taking the instance as
 * an argument — the bundler cannot share a graph that re-enters itself.
 */
export async function fetchSitemapGestures(
  payload: Payload
): Promise<SitemapGesture[]> {
  const gestures: SitemapGesture[] = [];

  for (let page = 1; page <= SITEMAP_MAX_PAGES; page++) {
    const result = await payload.find({
      collection: "gestures",
      depth: 0,
      limit: SITEMAP_PAGE_SIZE,
      overrideAccess: false,
      page,
      select: { updatedAt: true },
      // Stable across pages, so the loop cannot see one row twice and miss
      // another. `name` is localized and frequently null, so it is not.
      sort: "id",
      where: { isActive: { equals: true } },
    });

    for (const doc of result.docs) {
      gestures.push({ id: doc.id, updatedAt: doc.updatedAt });
    }

    if (!result.hasNextPage) {
      return gestures;
    }
  }

  payload.logger.warn(
    `[sitemap] Stopped after ${SITEMAP_MAX_PAGES} pages of ${SITEMAP_PAGE_SIZE}; the sitemap is truncated.`
  );

  return gestures;
}

/** The sitemap for one origin: the static pages, then every active gesture. */
export async function buildSitemap(
  payload: Payload,
  origin: string
): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries(origin, await fetchSitemapGestures(payload));
}

/**
 * XML-escapes a value going into an attribute or a text node.
 *
 * Next's own serializer does not do this — `resolve-route-data.js` in 16.3.3
 * interpolates `item.url` straight into `<loc>` — and it gets away with it
 * because the URLs it is usually given contain nothing to escape. Ours are
 * built from numeric ids and would too. It is here anyway: the day a slug
 * with an `&` in it reaches this function, the alternative to five lines of
 * escaping is a sitemap that every crawler rejects as malformed, and the
 * error surfaces in a search console nobody reads for a month.
 */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * The sitemap as the XML a crawler expects.
 *
 * Deliberately a local serializer rather than Next's. `resolveSitemap` lives
 * in `next/dist/build/webpack/loaders/metadata/resolve-route-data.js` — a
 * build-time webpack loader (not a runtime export) — so importing it would
 * mean reaching into an unpublished path and dragging loader code into the
 * Worker. The output is mirrored on it field for field, including emitting
 * `xmlns:xhtml` only when something uses it and placing `<xhtml:link>`
 * directly after `<loc>`, so the bytes stay familiar and a future move back
 * to a `sitemap.ts` changes nothing a crawler sees.
 */
export function renderSitemapXml(entries: MetadataRoute.Sitemap): string {
  const hasAlternates = entries.some(
    (entry) => Object.keys(entry.alternates?.languages ?? {}).length > 0
  );

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    hasAlternates
      ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
      : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const entry of entries) {
    lines.push("<url>", `<loc>${escapeXml(entry.url)}</loc>`);

    for (const [language, href] of Object.entries(
      entry.alternates?.languages ?? {}
    )) {
      /*
       * Next types `Languages<string>` as a mapped type whose every key is
       * optional, so an entry can carry a language with no href. Skipped
       * rather than emitted: `href="undefined"` is a URL a crawler will try.
       */
      if (href === undefined) {
        continue;
      }

      lines.push(
        `<xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}" />`
      );
    }

    if (entry.lastModified) {
      const lastModified =
        entry.lastModified instanceof Date
          ? entry.lastModified.toISOString()
          : entry.lastModified;

      lines.push(`<lastmod>${escapeXml(lastModified)}</lastmod>`);
    }

    lines.push("</url>");
  }

  lines.push("</urlset>", "");

  return lines.join("\n");
}
