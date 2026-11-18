/**
 * URL redaction shared by the CSP report log (`apps/site` `csp-report.ts`)
 * and error monitoring (`./monitoring.ts`): a URL keeps its origin and its
 * path, never its userinfo, query or fragment (re-edit and renewal links
 * carry raw tokens there), and path segments that carry a capability
 * become `:token`.
 */

/** A segment that looks like a minted token (`newToken`: 43 base64url). */
const TOKEN_LIKE = /^[A-Za-z0-9_-]{20,}$/;
/** Slugs and UUIDs stay readable: lower case, digits and single hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** 32+ hex characters: a migrated share token (U-20) or a digest, never a slug. */
const HEX_TOKEN = /^[0-9a-f]{32,}$/i;
const REPEATED_SLASHES = /\/{2,}/g;
const QUERY_OR_FRAGMENT = /[?#]/;
/**
 * Paths whose next segment is a capability, whatever it looks like: a
 * shared list on the web (`/lists/`) and in the app (`/shared/`), a reset
 * link and the signed logo upload.
 */
const TOKEN_PREFIXES = [
  "/lists/",
  "/shared/",
  "/api/auth/reset-password/",
  "/api/logos/upload/",
];

export const TOKEN_MARK = ":token";

const WEB_SCHEMES = new Set(["http:", "https:", "ws:", "wss:"]);
/** The base that parses a relative URL; stripped again from the result. */
const LOCAL_ORIGIN = "http://smog.invalid";

function isTokenSegment(segment: string): boolean {
  return (
    HEX_TOKEN.test(segment) || (TOKEN_LIKE.test(segment) && !SLUG.test(segment))
  );
}

/**
 * The path with its token segments masked. Repeated slashes are collapsed
 * and the prefixes compared case-insensitively first: the router matches
 * `/Lists/<token>` and `//lists/<token>` too.
 */
export function redactUrlPath(pathname: string): string {
  const path = pathname.replace(REPEATED_SLASHES, "/");
  const lower = path.toLowerCase();
  for (const prefix of TOKEN_PREFIXES) {
    if (lower.startsWith(prefix) && path.length > prefix.length) {
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf("/");
      return `${path.slice(0, prefix.length)}${TOKEN_MARK}${slash === -1 ? "" : redactUrlPath(rest.slice(slash))}`;
    }
  }
  return path
    .split("/")
    .map((segment) => (isTokenSegment(segment) ? TOKEN_MARK : segment))
    .join("/");
}

/**
 * A URL without its secrets: origin and redacted path for a web URL
 * (relative stays relative), `scheme:` plus the redacted path for an app
 * link (`smog://shared/<token>` is `smog:/shared/:token`), and the input's
 * part before any `?` or `#` with its path redacted when it does not parse.
 * Query, fragment and userinfo are always dropped.
 */
export function redactUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value, LOCAL_ORIGIN);
  } catch {
    const [head = ""] = value.split(QUERY_OR_FRAGMENT);
    return redactUrlPath(head);
  }
  if (!WEB_SCHEMES.has(url.protocol)) {
    // `smog://shared/abc`: the host is the first path segment.
    const path = url.host === "" ? url.pathname : `/${url.host}${url.pathname}`;
    return `${url.protocol}${redactUrlPath(path)}`;
  }
  const path = redactUrlPath(url.pathname);
  return url.origin === LOCAL_ORIGIN ? path : `${url.origin}${path}`;
}
