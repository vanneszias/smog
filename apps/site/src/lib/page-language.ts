import { LOCALE_CODE_MAX_LENGTH } from "@smog/config/constants";

/**
 * Language URLs (docs/DECISIONS.md, "Language URLs with `?lang=`"): every
 * public page is reachable in each enabled language through `?lang=<code>`,
 * with no cookie written, so a crawler or a shared link gets the language the
 * URL names. The bare URL keeps negotiating (cookie, account, browser) and is
 * the `x-default`. Only these pages read the parameter: on a private or
 * tokened page `?lang` changes nothing and no alternate names it, and the
 * admin's own `?lang` (the language being edited) keeps its meaning.
 */
export const LANG_PARAM = "lang";

/** The public, indexable pages, as the sitemap lists them (gestures apart). */
export const LANGUAGE_PAGE_PATHS = [
  "/",
  "/gestures",
  "/sponsor",
  "/privacy",
  "/terms",
] as const;

/** `/gestures/<slug>`: one segment under `/gestures`. */
const GESTURE_PAGE = /^\/gestures\/[^/]+$/;

/** Whether a path is a public page that `?lang` sets the language of. */
export function isLanguagePage(pathname: string): boolean {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return (
    (LANGUAGE_PAGE_PATHS as readonly string[]).includes(path) ||
    GESTURE_PAGE.test(path)
  );
}

/**
 * The `?lang` a page asks for, or null: only on a language page, and only a
 * value short enough to be a code. Whether it is an enabled language is the
 * shell's check (`getShell`), against the `language` table.
 */
export function pageLanguageParam(location: {
  pathname: string;
  search: Record<string, unknown>;
}): string | null {
  const value = location.search[LANG_PARAM];
  return isLanguagePage(location.pathname) &&
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= LOCALE_CODE_MAX_LENGTH
    ? value
    : null;
}

/** A page's absolute URL in one language (`?lang=fr`), or the bare one for null. */
export function languageUrl(
  siteUrl: string,
  path: string,
  code: string | null
): string {
  return code
    ? `${siteUrl}${path}?${LANG_PARAM}=${encodeURIComponent(code)}`
    : `${siteUrl}${path}`;
}
