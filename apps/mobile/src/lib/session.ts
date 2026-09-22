import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { API_BASE_URL, ApiError, payloadFetch } from "./api";
import { clearGuestFavorites, readGuestFavorites } from "./guest";

/**
 * The session this app keeps: one JWT, in the iOS/Android keychain via
 * `expo-secure-store`, plus the four operations Payload's own endpoints
 * support directly (`payload.config.ts`'s `endpoints` comment lists all
 * five; `mobileSignUp` is the one this app had to add). `payloadFetch`
 * calls `getToken` whenever a request asks for `auth: true`; everything
 * else in this module exists to keep the token that call reads correct.
 */

/** Where the token lives in the keychain. Exported so tests name it. */
export const TOKEN_KEY = "smog.session.token";

/**
 * The `AsyncStorage` key that survives exactly as long as the app does —
 * unlike the keychain, which survives a reinstall on iOS. See
 * {@link clearStaleInstall}. Exported so tests name it.
 */
export const INSTALL_MARKER = "smog.install";

/** The shape `GET /api/users/me` and a successful `/users/login` return. */
interface SessionUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Notified whenever the stored token changes, so a mounted
 * {@link SessionProvider} re-reads `/users/me` instead of only reflecting
 * whatever the token happened to be when it first mounted. Module-private:
 * nothing outside this file needs to subscribe, and the exported surface —
 * `signIn`, `signOut`, `refresh`, `storeToken`, `clearToken` — is exactly
 * what the brief asks for.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

function notifySessionChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Writes the token to the keychain. */
export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  notifySessionChanged();
}

/** Removes the token from the keychain. Safe to call when there is none. */
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  notifySessionChanged();
}

/**
 * The keychain outlives the app on iOS; `AsyncStorage` does not. A token
 * with no install marker beside it therefore belongs to a previous
 * installation, and resuming it is how a reinstall lands on a session whose
 * account may not exist any more — 401 on every request, with no
 * signed-out state to recover from.
 *
 * Returns whether this call just cleared a stale install, so
 * {@link getToken} can answer `null` directly rather than asking the
 * keychain for a value it only just told it to delete — under a mocked
 * `SecureStore` in a test, `deleteItemAsync` does not change what a
 * separately-mocked `getItemAsync` returns, so the caller has to know it
 * cleared rather than re-reading.
 */
async function clearStaleInstall(): Promise<boolean> {
  if ((await AsyncStorage.getItem(INSTALL_MARKER)) !== null) {
    return false;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await AsyncStorage.setItem(INSTALL_MARKER, "1");

  return true;
}

/**
 * The session module `payloadFetch` calls when a request asks for
 * `auth: true`.
 */
export async function getToken(): Promise<string | null> {
  if (await clearStaleInstall()) {
    return null;
  }

  return SecureStore.getItemAsync(TOKEN_KEY);
}

/**
 * Hands this device's guest favourites to the account that just signed in,
 * and clears them once — and only once — the account has them.
 *
 * **The ordering is the whole point, not a detail of it.** There are no
 * transactions on any write path this app has, so `clearGuestFavorites()`
 * runs only after `POST /account/merge-favorites` has answered. Clearing
 * first and then failing would throw the favorites away with nothing left
 * to retry from — the device's copy is the *only* copy until the account has
 * them too. Mirrors `apps/site/src/lib/mergeGuestState.ts`'s
 * `syncGuestFavorites`, which documents the identical rule for the identical
 * reason on the web side of this same merge.
 *
 * **Never throws.** A failed merge is not a failed sign-in — the token is
 * already stored by the time this runs, and a reader who typed the right
 * password should not see a sign-in error because their network stuttered
 * on an unrelated request. The device's list survives untouched, and the
 * next sign-in on this device offers it again: the server half is
 * idempotent (`mergeGuestFavorites` only ever adds what the account does
 * not already hold), so re-offering the same ids is safe.
 */
async function mergeGuestFavoritesIntoAccount(): Promise<void> {
  const ids = await readGuestFavorites();

  if (ids.length === 0) {
    // No request at all for the overwhelmingly common case: someone who
    // never favourited anything as a guest.
    return;
  }

  try {
    await payloadFetch("/account/merge-favorites", {
      auth: true,
      body: JSON.stringify({ ids }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    console.error(
      "[session] Failed to merge guest favorites on sign-in:",
      error
    );
    return;
  }

  // Last, and only here. See the ordering note above.
  await clearGuestFavorites();
}

/**
 * Signs in against the shadowed `POST /api/users/login`
 * (`endpoints/auth.ts`'s `usersLogin`), which answers JSON with the token
 * in the body rather than a cookie — the shape a native client needs,
 * since there is no browser to hold a `Set-Cookie` for it.
 *
 * Throws `ApiError` on a refusal (`payloadFetch`'s own behaviour); nothing
 * is stored in that case.
 *
 * On success, the device's guest favourites are merged into the newly
 * signed-in account — see {@link mergeGuestFavoritesIntoAccount}. This is
 * the one call site that decides a guest favourite becomes an account
 * favourite; `useFavorites` (`data/favorites.ts`) is the one call site that
 * decides which of the two a *new* favourite goes to. Two places deciding
 * either question would be one of them deciding it wrong.
 */
export async function signIn(email: string, password: string): Promise<void> {
  const result = await payloadFetch<{ token?: string }>("/users/login", {
    body: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (typeof result.token === "string") {
    await storeToken(result.token);
    await mergeGuestFavoritesIntoAccount();
  }
}

/**
 * `POST /api/mobile/sign-up` — the one endpoint Task 8 added on the site
 * side. `"accepted"` covers both a created account and an address already
 * registered; see `decideSignUp` in `apps/site/src/endpoints/auth.ts` for
 * why the two are one value.
 *
 * Deliberately not routed through `payloadFetch`: a `400` here is one of
 * two ordinary outcomes (`"invalid-email"`, `"weak-password"`), not a
 * failure to report through `ApiError`, and the body Payload never carries
 * on this endpoint — `{ status: ... }` rather than `{ errors: [...] }` —
 * is exactly what `payloadFetch`'s error handling is not shaped for.
 */
export async function signUp(
  email: string,
  password: string
): Promise<"accepted" | "invalid-email" | "weak-password"> {
  const response = await fetch(`${API_BASE_URL}/api/mobile/sign-up`, {
    body: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const body = (await response.json()) as { status?: unknown };

  if (
    body.status === "accepted" ||
    body.status === "invalid-email" ||
    body.status === "weak-password"
  ) {
    return body.status;
  }

  throw new ApiError("unknown", response.status);
}

/**
 * Signs out against `POST /api/users/logout`, which really does revoke the
 * session server-side (`logoutOperation`, the same one `signOut` on the
 * site calls).
 *
 * **The local clear happens whether or not the server call succeeds.**
 * Revoking server-side is best effort; a `signOut` that returned early on a
 * network error would leave someone signed in, on their own device, after
 * asking to be signed out of it — worse than a session that outlives its
 * server-side record by a few seconds.
 */
export async function signOut(): Promise<void> {
  try {
    await payloadFetch("/users/logout", { auth: true, method: "POST" });
  } catch (error) {
    console.error(
      "[session] Failed to revoke the session server-side on sign-out:",
      error
    );
  }

  await clearToken();
}

/**
 * `POST /api/users/refresh-token`, which mints a new token for the caller
 * `req.user` already resolved to — Payload's own `refreshOperation`
 * requires a valid session, so this call carries `auth: true` and answers
 * `{ refreshedToken }` on success.
 */
export async function refresh(): Promise<void> {
  const result = await payloadFetch<{ refreshedToken?: string }>(
    "/users/refresh-token",
    { auth: true, method: "POST" }
  );

  if (typeof result.refreshedToken === "string") {
    await storeToken(result.refreshedToken);
  }
}

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * The signed-in user, if there is a stored token, from `GET /api/users/me`
 * — or `null` for no token, an expired one, or a request that failed
 * outright. Kept separate from {@link SessionProvider} so the provider's
 * own effect stays a plain "resolve, then set state" shape rather than a
 * nested try/catch/finally.
 */
async function resolveSessionUser(): Promise<SessionUser | null> {
  const token = await getToken();

  if (token === null) {
    return null;
  }

  try {
    const result = await payloadFetch<{ user: SessionUser | null }>(
      "/users/me",
      { auth: true }
    );

    return result.user;
  } catch {
    return null;
  }
}

/**
 * Loads the signed-in user, if there is a stored token, from
 * `GET /api/users/me`. Re-run on mount and every time `storeToken` or
 * `clearToken` runs, so a screen calling `signIn`/`signOut` elsewhere in
 * the tree is reflected without every caller having to know about this
 * provider.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cancelled = { current: false };

    const load = async (): Promise<void> => {
      const nextUser = await resolveSessionUser();

      if (cancelled.current) {
        return;
      }

      setUser(nextUser);
      setLoading(false);
    };

    listeners.add(load);
    load();

    return () => {
      cancelled.current = true;
      listeners.delete(load);
    };
  }, []);

  return createElement(
    SessionContext.Provider,
    { value: { loading, user } },
    children
  );
}

/** The signed-in user, if any, and whether that is still being resolved. */
export function useSession(): { user: SessionUser | null; loading: boolean } {
  const context = useContext(SessionContext);

  if (context === null) {
    throw new Error("useSession must be used within a SessionProvider");
  }

  return context;
}
