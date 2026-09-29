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
  error?: string;
  redirect?: string;
}

export function validateAuthSearch(
  search: Record<string, unknown>
): AuthSearch {
  const redirect = safeRedirect(search.redirect);
  return {
    ...(typeof search.error === "string" ? { error: search.error } : {}),
    ...(redirect === "/" ? {} : { redirect }),
  };
}

/** `path` with `?redirect=` appended when it is not the home page. */
export function withRedirect(path: string, redirect: string): string {
  return redirect === "/"
    ? path
    : `${path}?redirect=${encodeURIComponent(redirect)}`;
}
