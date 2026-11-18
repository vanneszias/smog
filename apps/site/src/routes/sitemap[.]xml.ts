import { escapeHtml } from "@smog/utils";
import { createFileRoute } from "@tanstack/react-router";
import { LANGUAGE_PAGE_PATHS, languageUrl } from "@/lib/page-language";
import { siteOrigin } from "@/lib/site-url";
import { siteEnv } from "@/server/auth";
import { enabledLanguageCodes } from "@/server/catalogue";
import { createInProcessApiClient } from "@/server/in-process-api";

/** The protocol's limit of URLs in one sitemap. */
const MAX_URLS = 50_000;

/**
 * One page in every enabled language: a `<url>` per variant (`?lang=<code>`
 * and the bare URL, the `x-default`), each listing the whole set as
 * `xhtml:link` alternates, as `seoHead` does in the page's head.
 */
function pageUrls(
  origin: string,
  path: string,
  languages: readonly string[],
  lastmod?: number
): string[] {
  const modified =
    lastmod === undefined
      ? ""
      : `<lastmod>${new Date(lastmod).toISOString()}</lastmod>`;
  const alternates = [
    ...languages.map(
      (code) =>
        `<xhtml:link rel="alternate" hreflang="${escapeHtml(code)}" href="${escapeHtml(languageUrl(origin, path, code))}"/>`
    ),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(languageUrl(origin, path, null))}"/>`,
  ].join("");
  return [null, ...languages].map(
    (code) =>
      `<url><loc>${escapeHtml(languageUrl(origin, path, code))}</loc>${modified}${alternates}</url>`
  );
}

/**
 * `/sitemap.xml` (spec §9): the public pages and every published gesture
 * (`gestures.sitemap`, one D1 read), each in every enabled language
 * (`?lang=<code>`, docs/DECISIONS.md "Language URLs with `?lang=`") and
 * bare, within the protocol's 50 000 URLs; cached for an hour.
 */
async function sitemap(): Promise<Response> {
  try {
    const origin = siteOrigin(siteEnv().vars.SITE_URL);
    const [languages, gestures] = await Promise.all([
      enabledLanguageCodes(),
      createInProcessApiClient().gestures.sitemap(),
    ]);
    const perPage = languages.length + 1;
    const room = Math.floor(MAX_URLS / perPage) - LANGUAGE_PAGE_PATHS.length;
    const urls = [
      ...LANGUAGE_PAGE_PATHS.flatMap((path) =>
        pageUrls(origin, path, languages)
      ),
      ...gestures
        .slice(0, Math.max(room, 0))
        .flatMap((entry) =>
          pageUrls(
            origin,
            `/gestures/${encodeURIComponent(entry.slug)}`,
            languages,
            entry.updatedAt
          )
        ),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
    return new Response(body, {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "application/xml; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[sitemap] Failed to build the sitemap:", error);
    throw error;
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: sitemap } },
});
