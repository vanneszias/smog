/**
 * Cache policy by path class (phase 9 task 6, P-18, ruling 4). One table
 * for the Worker's responses (`cacheHeaders`, called from `headers.ts`
 * with `setMissing`, so a route that sets its own `Cache-Control` keeps
 * it) and for the static assets, which Cloudflare serves before the Worker
 * runs: `public/_headers` repeats the same values and `test/cache-policy.
 * test.ts` holds the two together.
 *
 * No `Vary` is needed: every locale-dependent response is a document
 * (`private, no-cache`) and the static files are language-free.
 *
 * - hashed build output, `/assets/<name>-<hash>.<ext>`: a year, immutable
 *   (the hash changes with the content);
 * - the unhashed brand files, icons, `og.png`, and any other `/assets/*`
 *   (the legacy `/assets/logo.svg`): a day;
 * - `/robots.txt`, `/sitemap.xml`, the web manifest: an hour;
 * - documents: `private, no-cache` (each carries its CSP nonce);
 * - `/api/*`, `/_serverFn/*` (TanStack server functions, session-dependent),
 *   `/webhooks/*`, `/dev/*` and every 5xx (the maintenance page
 *   included): `no-store`.
 */

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const ONE_DAY = "public, max-age=86400";
export const ONE_HOUR = "public, max-age=3600";
export const NO_STORE = "no-store";
export const NO_CACHE = "private, no-cache";

/** What Vite writes: `assets/<name>-<8 character hash>.<ext>`, `_`/`-` allowed in both. */
const HASHED_ASSET = /^\/assets\/.+-[A-Za-z0-9_-]{8}\.(?:css|js|woff2)$/;

/** The extensions `_headers` marks immutable: every hashed file Vite emits today. */
export const HASHED_EXTENSIONS = ["css", "js", "woff2"] as const;

const ICON_FILES = new Set([
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon.svg",
  "/og.png",
]);

const HOURLY_FILES = new Set([
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
]);

const UNCACHED_PREFIXES = [
  "/_serverFn/",
  "/api/",
  "/dev/",
  "/webhooks/",
] as const;

export interface CacheContext {
  contentType: string;
  pathname: string;
  status: number;
}

/** The `Cache-Control` for a response, or `undefined` to leave it as it is. */
export function cacheControlFor({
  contentType,
  pathname,
  status,
}: CacheContext): string | undefined {
  if (
    status >= 500 ||
    UNCACHED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NO_STORE;
  }
  if (status >= 300) {
    return;
  }
  if (HASHED_ASSET.test(pathname)) {
    return IMMUTABLE;
  }
  if (HOURLY_FILES.has(pathname)) {
    return ONE_HOUR;
  }
  if (
    ICON_FILES.has(pathname) ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/assets/")
  ) {
    return ONE_DAY;
  }
  return contentType.startsWith("text/html") ? NO_CACHE : undefined;
}

/** The headers to add when the response has no `Cache-Control` of its own. */
export function cacheHeaders(
  requestUrl: unknown,
  response: Response
): Record<string, string> {
  let pathname = "";
  try {
    pathname =
      typeof requestUrl === "string" ? new URL(requestUrl).pathname : "";
  } catch {
    // A bad URL gets the content-type rule only.
  }
  const value = cacheControlFor({
    contentType: response.headers.get("content-type") ?? "",
    pathname,
    status: response.status,
  });
  return value ? { "cache-control": value } : {};
}
