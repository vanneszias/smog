const PROBE_ORIGIN = "http://site.invalid";
/** Backslashes and C0/DEL control characters (browsers strip or remap them). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;
/**
 * Encoded `/`, `\`, dot segments and control characters, which decode into
 * another host or path further down the line.
 */
const ENCODED_SEPARATORS = /%(?:2f|5c|[01][0-9a-f]|7f)|%2e%2e|%2e(?=\/|$)/i;

const QUERY_OR_HASH = /[?#]/;

function unsafe(value: string): boolean {
  const pathname = value.split(QUERY_OR_HASH, 1)[0] ?? "";
  return (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    UNSAFE_CHARACTERS.test(value) ||
    ENCODED_SEPARATORS.test(pathname)
  );
}

/**
 * A `?redirect=` target after sign-in: a same-site path only, else the
 * home page. The input and the normalised result are both checked (dot
 * segments can collapse `/.//host` into `//host`), and the result must
 * resolve to this origin.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || unsafe(value)) {
    return "/";
  }
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return "/";
  }
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (url.origin !== PROBE_ORIGIN || unsafe(path)) {
    return "/";
  }
  return path;
}

/** Search params of the auth pages. */
export interface AuthSearch {
  error?: string | undefined;
  redirect?: string | undefined;
}

/**
 * Both keys are always present (`undefined` when absent or unsafe): the
 * root route validates no search, so its raw params flow into every
 * child's `search`, and an omitted key would keep the raw `redirect`
 * (an open redirect through `/magic-link`).
 */
export function validateAuthSearch(
  search: Record<string, unknown>
): AuthSearch {
  const redirect = safeRedirect(search.redirect);
  return {
    error: typeof search.error === "string" ? search.error : undefined,
    redirect: redirect === "/" ? undefined : redirect,
  };
}

/** `path` with `?redirect=` appended when it is not the home page. */
export function withRedirect(path: string, redirect: string): string {
  return redirect === "/"
    ? path
    : `${path}?redirect=${encodeURIComponent(redirect)}`;
}

/** Pages the header's "Sign in" link never returns to. */
const NO_RETURN = /^\/(?:sign-|magic-link(?:[/?#]|$))/;

/**
 * Where the header's "Sign in" link returns to: the current page without
 * any `token` in its query (a magic-link or reset token must not spread
 * into more URLs), and never an auth page or a magic link.
 */
export function signInReturnPath(href: string): string | undefined {
  if (NO_RETURN.test(href)) {
    return;
  }
  const url = new URL(href, PROBE_ORIGIN);
  url.searchParams.delete("token");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Search params of `/reset-password`. */
export interface ResetSearch {
  error?: string | undefined;
  token?: string | undefined;
}

/**
 * Both keys always set (`undefined` unless a string), like
 * `validateAuthSearch`: the router JSON-parses `?token=123` to a number,
 * and an omitted key would let the raw value through.
 */
export function validateResetSearch(
  search: Record<string, unknown>
): ResetSearch {
  return {
    error: typeof search.error === "string" ? search.error : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  };
}
