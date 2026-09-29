import { type ApiClient, createApiClient } from "@smog/api/client";
import { type MobileEnv, parseMobileEnv } from "@smog/config/env/mobile";

/**
 * What the api client needs from the Better Auth Expo client
 * (`createExpoAuthClient` from `@smog/auth/expo`): its `getCookie()`, which
 * reads the session cookie from SecureStore.
 */
interface SessionCookieSource {
  getCookie: () => string | Promise<string>;
}

/** `EXPO_PUBLIC_*`, validated on first use (Expo inlines each member). */
function mobileEnv(): MobileEnv {
  return parseMobileEnv({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_ENVIRONMENT: process.env.EXPO_PUBLIC_ENVIRONMENT,
    EXPO_PUBLIC_SITE_HOST: process.env.EXPO_PUBLIC_SITE_HOST,
  });
}

/**
 * The app's oRPC client for `EXPO_PUBLIC_API_URL`. Every request carries
 * the session cookie from the auth client; `credentials: "omit"` keeps the
 * native cookie jar out of it (Better Auth Expo docs). Created once by the
 * app root (Task 9 providers) with the app's auth client.
 */
export function createMobileApiClient(auth: SessionCookieSource): ApiClient {
  return createApiClient({
    baseUrl: mobileEnv().EXPO_PUBLIC_API_URL,
    fetch: (request, init) => fetch(request, { ...init, credentials: "omit" }),
    headers: async (): Promise<Record<string, string>> => {
      const cookie = await auth.getCookie();
      return cookie ? { cookie } : {};
    },
  });
}
