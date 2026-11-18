import { type AuthUser, toAuthState } from "@smog/auth/react";
import {
  type PublicAuthConfig,
  publicAuthConfig,
} from "@smog/config/env/worker";
import { localeCodeSchema } from "@smog/config/locale";
import {
  type CatalogueOverlay,
  isLocale,
  type LanguageInfo,
  type Locale,
  matchLocale,
  resolveLocale,
} from "@smog/i18n";
import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  getRequest,
  getRequestHeader,
  setCookie,
  setResponseHeader,
} from "@tanstack/react-start/server";
import {
  isTheme,
  LOCALE_COOKIE,
  parseTheme,
  preferenceCookie,
  THEME_COOKIE,
  type Theme,
} from "../lib/preferences";
import { siteEnv } from "./auth";
import { enabledLanguageCodes, loadSiteCatalogue } from "./catalogue";
import { requestSession } from "./session";

/** What every page needs before it renders (the root route's loader). */
export interface Shell {
  auth: PublicAuthConfig;
  /** The enabled languages in menu order (the language menu, the `Intl` tags). */
  languages: LanguageInfo[];
  locale: Locale;
  /**
   * Error monitoring of the browser (`lib/monitoring.ts`): this env's
   * public DSN and environment, or null when the Worker has no
   * `SENTRY_DSN` (then the page loads no SDK).
   */
  monitoring: { dsn: string; environment: string } | null;
  /**
   * The `ui_string` rows of the active and the default language, over the
   * shipped catalogue the bundle carries (phase 10b ruling 1). Data only: a
   * translator's edit reaches the next navigation without a deploy.
   */
  overlay: CatalogueOverlay;
  /**
   * The language the page's URL asked for (`?lang=fr` on a public page,
   * `lib/page-language.ts`) when it is an enabled one, else null. The head
   * makes it the canonical URL's language.
   */
  pageLang: Locale | null;
  siteUrl: string;
  theme: Theme;
  /** The signed-in user, so the header renders without a flash. */
  user: AuthUser | null;
}

/** What the root loader passes: the page's `?lang` (`pageLanguageParam`), or null. */
export interface ShellInput {
  lang: string | null;
}

function shellInput(input: unknown): ShellInput {
  const lang =
    typeof input === "object" && input !== null && "lang" in input
      ? input.lang
      : null;
  return {
    lang:
      typeof lang === "string" && localeCodeSchema.safeParse(lang).success
        ? lang
        : null,
  };
}

export const getShell = createServerFn()
  .validator(shellInput)
  .handler(async ({ data }): Promise<Shell> => {
    try {
      const { vars, worker } = siteEnv();
      // The signed-in user (one D1 read), or null.
      const session = await requestSession(getRequest());
      const cookie = getCookie(LOCALE_COOKIE) ?? null;
      // Set by the resolver (it may run again on the shipped fallback).
      const asked: { lang: Locale | null } = { lang: null };
      // A public page's `?lang` first, without writing the cookie (a
      // crawler or a shared link gets the language the URL names); then
      // this browser's choice (the cookie); signed in without one, the
      // account's language (set in the app, say), then the browser's. Only
      // an enabled language counts.
      const catalogue = await loadSiteCatalogue((enabled, fallback) => {
        asked.lang = matchLocale(data.lang, enabled);
        return (
          asked.lang ??
          resolveLocale(
            {
              acceptLanguage: getRequestHeader("accept-language") ?? null,
              cookie,
              preference: cookie ? null : (session?.user.locale ?? null),
            },
            enabled,
            fallback
          )
        );
      });
      // The document's language, as `<html lang>` states it (the Worker adds
      // `Vary: Accept-Language, Cookie` to every document, `headers.ts`).
      setResponseHeader("content-language", catalogue.locale);
      return {
        auth: publicAuthConfig(worker),
        languages: [...catalogue.languages],
        locale: catalogue.locale,
        monitoring: vars.SENTRY_DSN
          ? { dsn: vars.SENTRY_DSN, environment: vars.ENVIRONMENT }
          : null,
        overlay: catalogue.overlay,
        // The language the catalogue was loaded for: a failed read falls back
        // to the shipped languages, and the URL's only counts if it won.
        pageLang: asked.lang === catalogue.locale ? asked.lang : null,
        siteUrl: vars.SITE_URL,
        theme: parseTheme(getCookie(THEME_COOKIE)),
        user: toAuthState({ data: session, isPending: false }).user ?? null,
      };
    } catch (error) {
      console.error("[shell] Failed to load the shell:", error);
      throw error;
    }
  });

function secureCookies(): boolean {
  return siteEnv().vars.ENVIRONMENT !== "dev";
}

export const setTheme = createServerFn({ method: "POST" })
  .validator((theme: unknown): Theme => {
    if (!isTheme(theme)) {
      throw new Error("[shell] Invalid theme");
    }
    return theme;
  })
  .handler(({ data }): void => {
    setCookie(THEME_COOKIE, data, preferenceCookie(secureCookies()));
  });

export const setLocale = createServerFn({ method: "POST" })
  .validator((locale: unknown): Locale => localeCodeSchema.parse(locale))
  .handler(async ({ data }): Promise<void> => {
    // A language an admin disabled (or never added) is no cookie value.
    if (!isLocale(data, await enabledLanguageCodes())) {
      throw new Error("[shell] Invalid locale");
    }
    setCookie(LOCALE_COOKIE, data, preferenceCookie(secureCookies()));
  });
