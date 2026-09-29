/**
 * A `?redirect=` target after sign-in: a same-site path only (never
 * `//host`, `/\host` or a full URL), else the home page.
 */
export function safeRedirect(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }
  try {
    const url = new URL(value, "http://site.invalid");
    return url.origin === "http://site.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
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
