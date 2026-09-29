import { type AuthState, useAuthState } from "@smog/auth/react";
import type { GesturesContract } from "@smog/gestures/contract";
import type { GestureSummary } from "@smog/gestures/schema";
import {
  type GuestData,
  type LocalStore,
  toggleFavorite,
} from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { useRpcClient, useRpcQuery } from "@smog/rpc/react";
import {
  keepPreviousData,
  type Mutation,
  type QueryKey,
  type QueryStatus,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FavoritesContract } from "../contract";
import type { FavoritesPage } from "../schema";

/** The contract slice these hooks know, keyed as `appContract` mounts it. */
interface FavoritesSlice {
  favorites: FavoritesContract;
  gestures: GesturesContract;
}

/** Favorites change only through this user, and every write refetches. */
export const FAVORITES_STALE_TIME = 60_000;
/** `gestures.byIds` takes at most 100 ids: a guest's items, a page at a time. */
const GUEST_PAGE_SIZE = 100;
/** The flips of the signed-in path (the overlay, and when the last settles). */
const SET_FAVORITE_KEY = ["favorites", "setFavorite"] as const;

export type FavoritesStatus = "loading" | "ready" | "error";

export interface UseFavoritesOptions {
  /**
   * Load the favorite gestures (`items`); default `true`. A heart button
   * only needs `isFavorite` / `toggle`, so it passes `false` and `items`
   * stays empty.
   */
  items?: boolean;
}

export interface Favorites {
  /** More `items` to load (`loadMoreItems`). */
  hasMoreItems: boolean;
  /** Favorite gesture ids, newest first. */
  ids: ReadonlySet<string>;
  isFavorite: (gestureId: string) => boolean;
  /** Favorite gestures, newest first (the loaded pages). */
  items: GestureSummary[];
  itemsStatus: FavoritesStatus;
  /** Loads the next page of `items`. */
  loadMoreItems: () => Promise<void>;
  /**
   * `loading` while the session or the ids load (then nothing is shown yet,
   * so a signed-in user never sees a guest's favorites flash by).
   */
  status: FavoritesStatus;
  /**
   * Flips the favorite at once. Signed in, the API call follows (flips are
   * sent one after another, in tap order), and the flip is rolled back
   * (and the promise rejects) if it fails.
   */
  toggle: (gestureId: string) => Promise<void>;
}

const NO_IDS: ReadonlySet<string> = new Set();

const LOADING: Favorites = {
  hasMoreItems: false,
  ids: NO_IDS,
  isFavorite: () => false,
  items: [],
  itemsStatus: "loading",
  loadMoreItems: () => Promise.resolve(),
  status: "loading",
  toggle: () =>
    Promise.reject(new Error("[favorites] The session is still loading")),
};

function toStatus(status: QueryStatus): FavoritesStatus {
  if (status === "pending") {
    return "loading";
  }
  return status === "success" ? "ready" : "error";
}

/** `ids` with `gestureId` in front (`favorite`) or without it. */
function withFavorite(
  ids: readonly string[],
  gestureId: string,
  favorite: boolean
): string[] {
  const rest = ids.filter((id) => id !== gestureId);
  return favorite ? [gestureId, ...rest] : rest;
}

/** Only the gestures still in `ids`, so a removal hides its item at once. */
function stillFavorite(
  pages: readonly (readonly GestureSummary[])[] | undefined,
  ids: ReadonlySet<string> | undefined
): GestureSummary[] {
  const items = pages?.flat() ?? [];
  return ids ? items.filter((item) => ids.has(item.id)) : items;
}

/** A flip sent to the API: the state the user asked for. */
interface Flip {
  favorite: boolean;
  gestureId: string;
  userId: string;
}

/**
 * The user's flips still in flight, oldest first. `Mutation.state` is set
 * synchronously when `mutate` is called, so a second tap in the same tick
 * already sees the first.
 */
function pendingFlips(
  mutations: readonly PendingFlip[],
  userId: string
): Flip[] {
  return [...mutations]
    .sort((a, b) => a.order - b.order)
    .flatMap(({ flip }) => (flip && flip.userId === userId ? [flip] : []));
}

/** A pending flip mutation as `pendingFlips` reads it. */
interface PendingFlip {
  flip: Flip | undefined;
  /** `mutationId`: increasing in call order. */
  order: number;
}

function toPendingFlip(mutation: Mutation): PendingFlip {
  return {
    flip: mutation.state.variables as Flip | undefined,
    order: mutation.mutationId,
  };
}

/** The server ids with the pending flips applied in order (the last tap wins). */
function withFlips(ids: readonly string[], flips: readonly Flip[]): string[] {
  return flips.reduce(
    (current, flip) => withFavorite(current, flip.gestureId, flip.favorite),
    [...ids]
  );
}

/** Favorites queries whose key carries a user id other than `userId`. */
function isOtherUsers(queryKey: QueryKey, userId: string | undefined): boolean {
  const scope = queryKey[2] as { userId?: unknown } | undefined;
  return scope?.userId !== undefined && scope.userId !== userId;
}

function useAccountFavorites(
  auth: { status: AuthState["status"]; userId: string | undefined },
  withItems: boolean
): Favorites {
  const { userId } = auth;
  const enabled = userId !== undefined;
  const client = useRpcClient<FavoritesSlice>();
  const rpc = useRpcQuery<FavoritesSlice>().favorites;
  const queryClient = useQueryClient();
  // Keyed by user, so another account never sees this one's cache.
  const idsKey = useMemo(
    () => [...rpc.ids.key({ type: "query" }), { userId }] as const,
    [rpc, userId]
  );

  // After a sign-out or an account switch, drop the other users' cache.
  useEffect(() => {
    if (auth.status === "loading") {
      return;
    }
    queryClient.removeQueries({
      predicate: (query) => isOtherUsers(query.queryKey, userId),
      queryKey: rpc.key(),
    });
  }, [auth.status, queryClient, rpc, userId]);

  const ids = useQuery({
    enabled,
    queryFn: ({ signal }) => client.favorites.ids(undefined, { signal }),
    queryKey: idsKey,
    staleTime: FAVORITES_STALE_TIME,
  });

  const list = useInfiniteQuery({
    enabled: enabled && withItems,
    getNextPageParam: (page: FavoritesPage) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.favorites.list({ cursor: pageParam }, { signal }),
    queryKey: [...rpc.list.key({ type: "infinite" }), { userId }],
    staleTime: FAVORITES_STALE_TIME,
  });

  const { mutateAsync } = useMutation({
    mutationFn: ({ favorite, gestureId }: Flip) =>
      favorite
        ? client.favorites.add({ gestureId })
        : client.favorites.remove({ gestureId }),
    mutationKey: SET_FAVORITE_KEY,
    // The optimistic state is the pending flips laid over the server ids
    // (`withFlips`), so a failed flip rolls back by leaving the pending
    // set, and a refetch in flight cannot overwrite a newer tap.
    onError: (error) => {
      console.error("[favorites] Failed to change a favorite:", error);
    },
    onSettled: async () => {
      // Refetch once the last flip settles (this one still counts).
      if (queryClient.isMutating({ mutationKey: SET_FAVORITE_KEY }) === 1) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: rpc.ids.key() }),
          queryClient.invalidateQueries({ queryKey: rpc.list.key() }),
        ]);
      }
    },
    // The confirmed flip goes into the cache, so nothing flickers between
    // settling and the refetch.
    onSuccess: (_data, { favorite, gestureId }) => {
      queryClient.setQueryData<string[]>(idsKey, (current) =>
        current ? withFavorite(current, gestureId, favorite) : current
      );
    },
    // One queue for every flip: the server applies them in tap order.
    scope: { id: "favorites" },
  });

  const pending = useMutationState({
    filters: { mutationKey: SET_FAVORITE_KEY, status: "pending" },
    select: toPendingFlip,
  });
  const idSet = useMemo(() => {
    if (!(ids.data && userId)) {
      return;
    }
    return new Set(withFlips(ids.data, pendingFlips(pending, userId)));
  }, [ids.data, pending, userId]);

  const toggle = useCallback(
    async (gestureId: string) => {
      if (!userId) {
        return;
      }
      // Read the cache and the flips now, not the last render: a second
      // tap in the same tick must see the first.
      const current = withFlips(
        queryClient.getQueryData<string[]>(idsKey) ?? [],
        pendingFlips(
          queryClient
            .getMutationCache()
            .findAll({ mutationKey: SET_FAVORITE_KEY, status: "pending" })
            .map(toPendingFlip),
          userId
        )
      );
      const favorite = !current.includes(gestureId);
      // analytics: gesture_collection_changed {action: favorite ? "added" : "removed", collection: "favorites", gesture_id}
      await mutateAsync({ favorite, gestureId, userId });
    },
    [idsKey, mutateAsync, queryClient, userId]
  );
  const { fetchNextPage } = list;
  const loadMoreItems = useCallback(async () => {
    await fetchNextPage();
  }, [fetchNextPage]);

  return {
    hasMoreItems: withItems && list.hasNextPage,
    ids: idSet ?? NO_IDS,
    isFavorite: (gestureId) => idSet?.has(gestureId) ?? false,
    items: stillFavorite(
      list.data?.pages.map((page) => page.items),
      idSet
    ),
    itemsStatus: withItems ? toStatus(list.status) : "ready",
    loadMoreItems,
    status: toStatus(ids.status),
    toggle,
  };
}

function selectFavorites(data: GuestData): string[] {
  return data.favorites;
}

/** Whether the store has read its adapter (before that it holds defaults). */
function useStoreReady(store: LocalStore): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    store.ready.then(() => {
      if (active) {
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [store]);
  return ready;
}

function useGuestFavorites(enabled: boolean, withItems: boolean): Favorites {
  const store = useLocalStoreInstance();
  const stored = useLocalStore(selectFavorites);
  const ready = useStoreReady(store);
  const client = useRpcClient<FavoritesSlice>();
  const rpc = useRpcQuery<FavoritesSlice>().gestures;
  // The store appends, so newest first is the reverse.
  const order = useMemo(() => [...stored].reverse(), [stored]);
  const idSet = useMemo(() => new Set(order), [order]);
  const hasFavorites = order.length > 0;

  const list = useInfiniteQuery({
    enabled: enabled && withItems && ready && hasFavorites,
    getNextPageParam: (_page: GestureSummary[], pages: GestureSummary[][]) => {
      const next = pages.length * GUEST_PAGE_SIZE;
      return next < order.length ? next : undefined;
    },
    initialPageParam: 0,
    // Removing a favorite changes the key; the loaded items stay (filtered).
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) =>
      client.gestures.byIds(
        { ids: order.slice(pageParam, pageParam + GUEST_PAGE_SIZE) },
        { signal }
      ),
    queryKey: [...rpc.byIds.key({ type: "infinite" }), { ids: order }],
    staleTime: FAVORITES_STALE_TIME,
  });

  const toggle = useCallback(
    // analytics: gesture_collection_changed {action, collection: "favorites", gesture_id}
    (gestureId: string) => store.update(toggleFavorite(gestureId)),
    [store]
  );
  const { fetchNextPage } = list;
  const loadMoreItems = useCallback(async () => {
    await fetchNextPage();
  }, [fetchNextPage]);

  let itemsStatus: FavoritesStatus = "ready";
  if (!ready) {
    itemsStatus = "loading";
  } else if (withItems && hasFavorites) {
    itemsStatus = toStatus(list.status);
  }
  return {
    hasMoreItems: withItems && hasFavorites && list.hasNextPage,
    ids: idSet,
    isFavorite: (gestureId) => idSet.has(gestureId),
    items: hasFavorites ? stillFavorite(list.data?.pages, idSet) : [],
    itemsStatus,
    loadMoreItems,
    status: ready ? "ready" : "loading",
    toggle,
  };
}

/**
 * The user's favorites, from the API when signed in and from the local
 * store for guests (spec §11), behind one shape: screens never branch on
 * it. While the session loads, it is `loading` and reads neither source.
 * Signed in, `toggle` flips the ids optimistically (pending flips laid
 * over the server ids), rolls back on error, refetches `favorites.ids` and
 * `favorites.list` once the last flip settles, and drops other users'
 * favorites cache after a sign-out or an account switch.
 */
export function useFavorites({
  items = true,
}: UseFavoritesOptions = {}): Favorites {
  const auth = useAuthState();
  const signedIn = auth.status === "signedIn";
  const account = useAccountFavorites(
    { status: auth.status, userId: signedIn ? auth.user?.id : undefined },
    items
  );
  const guest = useGuestFavorites(auth.status === "signedOut", items);
  if (auth.status === "loading") {
    return LOADING;
  }
  return signedIn ? account : guest;
}
