/**
 * The origin the locale layout hands Next as `metadataBase`.
 *
 * Open Graph and X require an absolute image URL, and without a base Next
 * resolves `/og.png` against `http://localhost:3000` in production
 * (`getSocialImageMetadataBaseFallback` in
 * `next/dist/lib/metadata/resolvers/resolve-url.js`, 16.3.3) — a preview
 * card that never loads for anyone.
 *
 * `SITE_ORIGIN` wins when it is set, which it is on both deployed Workers
 * (`wrangler.jsonc`; OpenNext copies a Worker's string vars into
 * `process.env` before the first request). It is the public origin by
 * definition, so a page reached through some other host still points link
 * previews at the real one.
 *
 * Without it — `next dev`, the e2e server, a local preview — the request's own
 * host is the only honest answer. Reading it costs nothing extra: the layout
 * already reads the request to resolve the session, which is what makes every
 * page under it dynamic. The scheme is `x-forwarded-proto` when a proxy says
 * so, `http` for a loopback host and `https` otherwise.
 *
 * `undefined` when neither is usable, so a malformed value degrades to Next's
 * own fallback instead of failing every page's metadata.
 */
export function resolveSiteOrigin(
  configured: string | undefined,
  requestHeaders: Headers
): URL | undefined {
  if (configured !== undefined && configured.trim() !== "") {
    return parseOrigin(configured.trim());
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (host === null || host.trim() === "") {
    return;
  }

  const forwarded = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const scheme =
    forwarded === "http" || forwarded === "https"
      ? forwarded
      : defaultScheme(host.trim());

  return parseOrigin(`${scheme}://${host.trim()}`);
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function defaultScheme(host: string): "http" | "https" {
  return LOOPBACK_HOST.test(host) ? "http" : "https";
}

function parseOrigin(value: string): URL | undefined {
  try {
    return new URL(new URL(value).origin);
  } catch {
    return;
  }
}
