/**
 * The locales the public site serves, mirroring `localization.locales` in
 * `payload.config.ts`. Dutch is the default because it is the locale all
 * existing content is authored in; `en` and `fr` start empty and fall back.
 *
 * Every public URL is locale-prefixed, including the default. Prefixing `nl`
 * costs one redirect from `/` and buys a URL whose meaning does not depend on
 * a cookie — which matters for share links, which are pasted between people
 * whose browsers disagree.
 */
export const LOCALES = ["nl", "en", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "nl";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Narrows a URL segment to a `Locale`, falling back to the default rather
 * than throwing. The route itself is responsible for 404ing an unknown
 * locale; this exists so every helper downstream can assume a valid value.
 */
export function resolveLocale(segment: string | undefined): Locale {
  return segment !== undefined && isLocale(segment) ? segment : DEFAULT_LOCALE;
}

/**
 * Only ever used as a base so `URL` will parse a relative path; never emitted.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere, so if this ever
 * does leak into an `href` it fails loudly instead of navigating somewhere.
 */
const RELATIVE_BASE = "https://locale-href.invalid";

/**
 * The same page in another locale.
 *
 * Takes the current path *and* its query — `usePathname()` and
 * `useSearchParams()` joined — because a visitor two pages into a filtered
 * list who switches language should stay where they are, not be dropped on
 * the locale root.
 *
 * Parsed with `URL` rather than string surgery, for three reasons a naive
 * implementation gets wrong:
 *
 * - `pathname.replace(current, next)` rewrites every occurrence, so
 *   `/en/gestures/en-something` becomes `/fr/gestures/fr-something`, which
 *   404s.
 * - anything that walks the raw string rewrites locale-looking text inside
 *   the query too, sending the visitor somewhere they did not ask to go.
 * - splitting on `/` without dropping the empty segments turns `/` into
 *   `/nl/`, a different URL to `/nl` for a crawler.
 *
 * Only `pathname`, `search` and `hash` are returned, so an absolute URL
 * handed in here degrades to a same-origin path rather than becoming an
 * off-site link.
 */
export function localeHref(pathname: string, next: Locale): string {
  const url = new URL(pathname, RELATIVE_BASE);
  const segments = url.pathname.split("/").filter((segment) => segment !== "");

  if (segments.length > 0 && isLocale(segments[0])) {
    segments[0] = next;
  } else {
    segments.unshift(next);
  }

  return `/${segments.join("/")}${url.search}${url.hash}`;
}

/**
 * One page's URL in every locale, keyed by locale, for
 * `alternates.languages`.
 *
 * Takes the path *after* the locale segment (`""` for a locale root), so
 * callers cannot accidentally build `/nl/nl/gestures`. Every locale is
 * path-prefixed, including the default, so there is no bare-root special
 * case.
 *
 * The values are relative. Next resolves them against `metadataBase` when one
 * is set and emits them unchanged when it is not — verified in
 * `next/dist/lib/metadata/resolvers/resolve-url.js` (16.3.3), whose
 * `resolveAbsoluteUrlWithPathname` returns the string untouched without a
 * base. This app sets no `metadataBase`, because the only honest value is the
 * host the request arrived on and reading that in `generateMetadata` would
 * opt every prerendered page out of static rendering. The sitemap, which must
 * carry absolute URLs, builds its own from the request origin instead.
 */
export function localeAlternates(path: string): Record<Locale, string> {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, `/${locale}${path}`])
  ) as Record<Locale, string>;
}
