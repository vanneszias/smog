import { type ApiClient, createApiClient } from "@smog/api/client";
import type { ExpoAuthClient } from "@smog/auth/expo";
import { mobileEnv } from "./env";

/**
 * What the api client needs from the app's Better Auth Expo client
 * (`createExpoAuthClient`): its `getCookie()`, which reads the session
 * cookie from SecureStore. The app root owns that client (`AppProviders`)
 * and passes it in, so there is one auth client per app and tests need no
 * SecureStore.
 */
type SessionCookieSource = Pick<ExpoAuthClient, "getCookie">;

/**
 * The app's oRPC client for `EXPO_PUBLIC_API_URL`. Every request carries
 * the session cookie from the auth client; `credentials: "omit"` keeps the
 * native cookie jar out of it (Better Auth Expo docs). Created once by
 * `AppProviders` with the app's auth client.
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
