import type { GestureSummary } from "@smog/ui-native";
import { getLocales } from "expo-localization";
import { useCallback, useEffect, useState } from "react";
import { ApiError, payloadFetch } from "@/lib/api";
import {
  MAX_GUEST_FAVORITES,
  readGuestFavorites,
  toggleGuestFavorite,
} from "@/lib/guest";
import { type Locale, resolveLocale } from "@/lib/locale";
import { useSession } from "@/lib/session";

/**
 * Favourites: one heart, backed by the device or the account depending on
 * who is looking at it — and `useFavorites` below is the only thing in this
 * app that decides which. `session.ts`'s `signIn` is the only other place
 * that ever moves an id between the two, on the one-off occasion of a
 * sign-in merge; nothing else picks a backend for a *new* favourite. Two
 * call sites making that choice is one call site making it wrong.
 *
 * ## Signed-in favourites: writes and reads are two different requests
 *
 * `endpoints/favorites.ts` (`apps/site/src/endpoints/favorites.ts`) has
 * exactly one write, `POST /account/favorites`, whose body is
 * `{ favorite: boolean, gestureId: string }` and whose answer is
 * `{ favorite: boolean }` — the state that was actually stored, not the
 * account's whole list. There is no read endpoint alongside it; the
 * account's current ids come back from `GET /users/me`'s own `favorites`
 * field, at whatever depth the request asks for. `depth: 0` is enough here
 * — this module only ever needs the bare ids, and populating each one would
 * be Payload joining a table this screen has no other use for.
 *
 * ## Guest favourites: the device and nothing else
 *
 * Signed out, every read and write goes through `lib/guest.ts`, which is
 * `AsyncStorage` and nothing else — no guest identity, no server row,
 * nothing to reconcile until `signIn` merges it into an account.
 */

/** What `GET /api/users/me?depth=0` hands back for `favorites`. */
interface MeResponse {
  user: { favorites?: (number | string)[] | null } | null;
}

function currentLocale(): Locale {
  return resolveLocale(getLocales().map((locale) => locale.languageTag));
}

export interface UseFavoritesResult {
  /** The current favourite ids, guest or account, whichever applies. */
  ids: string[];
  /** Still resolving the initial list — the session, or the first read. */
  loading: boolean;
  /** Adds or removes one gesture, choosing the backend for the caller. */
  toggle: (id: string) => Promise<void>;
  /** Whether `toggle` writes to the account rather than the device. */
  signedIn: boolean;
}

/**
 * The one hook every screen in this app reads and writes a favourite
 * through.
 *
 * `signedIn` is derived from `useSession`, not asked for by the caller, for
 * the same reason `toggle` is a single function rather than two: a screen
 * that had to pass its own guess about sign-in status could pass a stale
 * one, and the two would disagree the moment a session expires mid-visit.
 */
export function useFavorites(): UseFavoritesResult {
  const { loading: sessionLoading, user } = useSession();
  const signedIn = user !== null;
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = signedIn
      ? payloadFetch<MeResponse>("/users/me?depth=0", {
          auth: true,
          locale: currentLocale(),
        }).then(
          (result) => (result.user?.favorites ?? []).map(String),
          () => [] as string[]
        )
      : readGuestFavorites();

    load.then((resolved) => {
      if (!cancelled) {
        setIds(resolved);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [signedIn, sessionLoading]);

  const toggle = useCallback(
    async (id: string) => {
      if (!signedIn) {
        const next = await toggleGuestFavorite(id);
        setIds(next);
        return;
      }

      const favorite = !ids.includes(id);

      try {
        const result = await payloadFetch<{ favorite: boolean }>(
          "/account/favorites",
          {
            auth: true,
            body: JSON.stringify({ favorite, gestureId: id }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );

        setIds((current) =>
          result.favorite
            ? [...new Set([...current, id])]
            : current.filter((existing) => existing !== id)
        );
      } catch (error) {
        console.error("[favorites] Failed to save the favourite:", error);
        throw error instanceof ApiError ? error : new ApiError("network", 0);
      }
    },
    [ids, signedIn]
  );

  return { ids, loading, signedIn, toggle };
}

/**
 * Turns favourited ids into cards, the way the guest favourites page on the
 * web does it (`apps/site/src/lib/favoritesQuery.ts`) — by asking Payload's
 * own `GET /api/gestures`, filtered and capped, rather than by trusting the
 * ids.
 *
 * **A favourited gesture an editor has since deactivated does not come
 * back**, because `where[isActive][equals]=true` is `publicReadActive`
 * enforcing the same rule the detail page and the browse tab already run
 * under. The result below is built from what the API actually answered —
 * `byId.get(id)` for each requested id, filtered to the ones that resolved
 * — so a stale id simply falls out of the list rather than rendering a
 * blank row or, worse, the wrong gesture's name under the wrong id.
 */
export interface UseFavoriteGesturesResult {
  data: GestureSummary[];
  error: ApiError | null;
  loading: boolean;
}

/**
 * How many favourite ids one request resolves — see `favoritesQuery.ts`'s
 * `MAX_FAVORITE_IDS` for the same bound on the web.
 *
 * Re-exported from `lib/guest.ts`'s `MAX_GUEST_FAVORITES` rather than
 * declared again here: the two describe the same bound (how many ids one
 * `where[id][in]` request may carry) and a second literal is a second place
 * for that number to drift. `favorites.test.ts` pins this re-export by name.
 */
export const MAX_RESOLVED_FAVORITES = MAX_GUEST_FAVORITES;

interface RawGesture {
  id: number | string;
  name?: string | null;
  playbackId?: string | null;
  categories?:
    | ({ id: number | string; name?: string | null } | number | string)[]
    | null;
}

function toSummary(raw: RawGesture): GestureSummary {
  const categories = (raw.categories ?? [])
    .filter(
      (category): category is { id: number | string; name?: string | null } =>
        typeof category === "object" && category !== null
    )
    .map((category) => ({
      id: String(category.id),
      name: category.name ?? "",
    }));

  return {
    categories,
    id: String(raw.id),
    name: raw.name ?? "",
    playbackId: raw.playbackId,
  };
}

export function useFavoriteGestures(
  ids: readonly string[]
): UseFavoriteGesturesResult {
  const [data, setData] = useState<GestureSummary[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(ids.length > 0);
  const key = ids.join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is `ids` flattened to a stable primitive so this effect re-runs only when the actual set of ids changes, not on every new array reference a caller passes.
  useEffect(() => {
    if (ids.length === 0) {
      setData([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const wanted = ids.slice(0, MAX_RESOLVED_FAVORITES);
    const search = new URLSearchParams({
      depth: "1",
      limit: String(wanted.length),
      "where[id][in]": wanted.join(","),
      "where[isActive][equals]": "true",
    });

    payloadFetch<{ docs: RawGesture[] }>(`/gestures?${search.toString()}`, {
      locale: currentLocale(),
    }).then(
      (result) => {
        if (cancelled) {
          return;
        }

        const byId = new Map(
          result.docs.map((doc) => [String(doc.id), toSummary(doc)])
        );

        setData(
          wanted
            .map((id) => byId.get(id))
            .filter(
              (summary): summary is GestureSummary => summary !== undefined
            )
        );
        setLoading(false);
      },
      (loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof ApiError
              ? loadError
              : new ApiError("network", 0)
          );
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { data, error, loading };
}
