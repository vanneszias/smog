/**
 * The site's theme and language preferences: cookies the server reads on
 * every request, so the first HTML already has the right `lang` and theme
 * (no flash on SSR).
 */

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "theme";
export const LOCALE_COOKIE = "locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** One year, whole site, `SameSite=Lax`; `Secure` outside dev. */
export function preferenceCookie(secure: boolean) {
  return {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
}

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

export function parseTheme(value: string | null | undefined): Theme {
  return isTheme(value) ? value : "system";
}

/**
 * For `system`: sets the `dark` class from `prefers-color-scheme` before the
 * first paint. It runs from `<head>`, ahead of the stylesheet's first use.
 */
export const SYSTEM_THEME_SCRIPT =
  'try{document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme: dark)").matches)}catch(e){}';
