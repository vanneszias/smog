import { LOCALES } from "./locale";

/**
 * `robots.txt`, rendered for one origin.
 *
 * Hand-rendered rather than returned as Next's `MetadataRoute.Robots`,
 * because this app does not serve the file from a `robots.ts`: see the
 * comment at the top of `endpoints/crawler.ts` for the bundle measurement
 * that decided that. The output is modelled on Next's own serializer
 * (`resolveRobots` in
 * `next/dist/build/webpack/loaders/metadata/resolve-route-data.js`, 16.3.3),
 * which emits `User-Agent`, then `Allow`, then `Disallow`, then a trailing
 * `Sitemap` line — so the file looks the same as it would have if it were
 * generated the usual way.
 *
 * Three rules, each with a reason:
 *
 * - **`/admin` is disallowed.** The Payload admin panel is not content. It
 *   answers a login screen to a crawler, and every one of its URLs would be
 *   a duplicate of that screen.
 * - **`/api/` is disallowed, `/api/media/` allowed back.** The REST API
 *   answers JSON for the same rows the public pages render, which is
 *   duplicate content nobody searches for, and `/api/graphql-playground` is
 *   a UI with no content at all. Uploaded media is served *through* the same
 *   prefix (`/api/media/file/...`), and an image that robots.txt forbids
 *   cannot be indexed or shown in an image result — so it is allowed back by
 *   the more specific rule. Google resolves Allow-versus-Disallow by the
 *   longest matching path, which is why the order of the two lines does not
 *   matter.
 * - **`/<locale>/favorites` is disallowed, per locale.** The page already
 *   carries `robots: { index: false }` in its metadata; this keeps a crawler
 *   from spending a request to discover that. Spelled out per locale rather
 *   than as one wildcard path, because path wildcards are a Google extension
 *   and not part of the original exclusion standard — there are three
 *   locales and they are already a list.
 *
 * The `Sitemap` line is absolute, as the standard requires, and is built
 * from the origin the request arrived on so staging advertises staging's
 * sitemap and production advertises production's. Nothing here is hardcoded
 * to a host; there is no `NEXT_PUBLIC_SITE_URL` to forget to set.
 */
export function robotsTxt(origin: string): string {
  const base = origin.replace(/\/+$/, "");

  const lines = [
    "User-Agent: *",
    "Allow: /",
    "Allow: /api/media/",
    "Disallow: /admin",
    "Disallow: /api/",
    ...LOCALES.map((locale) => `Disallow: /${locale}/favorites`),
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ];

  return lines.join("\n");
}
