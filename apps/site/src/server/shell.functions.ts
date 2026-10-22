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
  resolveLocale,
} from "@smog/i18n";
import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  getRequest,
  getRequestHeader,
  setCookie,
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
   * The `ui_string` rows of the active and the default language, over the
   * shipped catalogue the bundle carries (phase 10b ruling 1). Data only: a
   * translator's edit reaches the next navigation without a deploy.
   */
  overlay: CatalogueOverlay;
  siteUrl: string;
  theme: Theme;
  /** The signed-in user, so the header renders without a flash. */
  user: AuthUser | null;
}

export const getShell = createServerFn().handler(async (): Promise<Shell> => {
  try {
    const { vars, worker } = siteEnv();
    // The signed-in user (one D1 read), or null.
    const session = await requestSession(getRequest());
    const cookie = getCookie(LOCALE_COOKIE) ?? null;
    // This browser's choice (the cookie) first; signed in without one, the
    // account's language (set in the app, say), then the browser's. Only an
    // enabled language counts.
    const catalogue = await loadSiteCatalogue((enabled, fallback) =>
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
    return {
      auth: publicAuthConfig(worker),
      languages: [...catalogue.languages],
      locale: catalogue.locale,
      overlay: catalogue.overlay,
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
