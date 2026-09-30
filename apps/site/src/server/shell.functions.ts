import { getSession } from "@smog/auth";
import { type AuthUser, toAuthState } from "@smog/auth/react";
import {
  type PublicAuthConfig,
  publicAuthConfig,
} from "@smog/config/env/worker";
import { isLocale, type Locale, resolveLocale } from "@smog/i18n";
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
import { getAuth, siteEnv } from "./auth";

/** What every page needs before it renders (the root route's loader). */
export interface Shell {
  auth: PublicAuthConfig;
  locale: Locale;
  siteUrl: string;
  theme: Theme;
  /** The signed-in user, so the header renders without a flash. */
  user: AuthUser | null;
}

/** The request's signed-in user (one D1 read), or null. */
async function requestUser(): Promise<AuthUser | null> {
  const session = await getSession(getAuth(), getRequest().headers);
  return toAuthState({ data: session, isPending: false }).user ?? null;
}

export const getShell = createServerFn().handler(async (): Promise<Shell> => {
  try {
    const { vars, worker } = siteEnv();
    return {
      auth: publicAuthConfig(worker),
      locale: resolveLocale({
        acceptLanguage: getRequestHeader("accept-language") ?? null,
        cookie: getCookie(LOCALE_COOKIE) ?? null,
      }),
      siteUrl: vars.SITE_URL,
      theme: parseTheme(getCookie(THEME_COOKIE)),
      user: await requestUser(),
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
  .validator((locale: unknown): Locale => {
    if (!isLocale(locale)) {
      throw new Error("[shell] Invalid locale");
    }
    return locale;
  })
  .handler(({ data }): void => {
    setCookie(LOCALE_COOKIE, data, preferenceCookie(secureCookies()));
  });
