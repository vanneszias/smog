import { useAuthState } from "@smog/auth/react";
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
  type QueryStatus,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FavoritesContract, GestureLookupContract } from "../contract";
import type { FavoritesPage } from "../schema";

/** The contract slice these hooks know, keyed as `appContract` mounts it. */
interface FavoritesSlice {
  favorites: FavoritesContract;
  gestures: GestureLookupContract;
}

/** Favorites change only through this user, and every write refetches. */
export const FAVORITES_STALE_TIME = 60_000;
/** `gestures.byIds` takes at most 100 ids: a guest's items, a page at a time. */
const GUEST_PAGE_SIZE = 100;
/** The one mutation of the signed-in path, to know when the last settles. */
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
   * Flips the favorite at once. Signed in, the API call follows, and the
   * flip is rolled back (and the promise rejects) if it fails.
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

function useAccountFavorites(
  userId: string | undefined,
  withItems: boolean
): Favorites {
  const enabled = userId !== undefined;
  const client = useRpcClient<FavoritesSlice>();
  const rpc = useRpcQuery<FavoritesSlice>().favorites;
  const queryClient = useQueryClient();
  // Keyed by user, so another account never sees this one's cache.
  const idsKey = useMemo(
    () => [...rpc.ids.key({ type: "query" }), { userId }] as const,
    [rpc, userId]
  );

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

  const mutation = useMutation({
    mutationFn: ({
      favorite,
      gestureId,
    }: {
      favorite: boolean;
      gestureId: string;
    }) =>
      favorite
        ? client.favorites.add({ gestureId })
        : client.favorites.remove({ gestureId }),
    mutationKey: SET_FAVORITE_KEY,
    onError: (_error, { favorite, gestureId }) => {
      // Undo this flip only, so other in-flight flips keep theirs.
      queryClient.setQueryData<string[]>(idsKey, (current) =>
        current ? withFavorite(current, gestureId, !favorite) : current
      );
    },
    onMutate: async ({ favorite, gestureId }) => {
      await queryClient.cancelQueries({ queryKey: idsKey });
      queryClient.setQueryData<string[]>(idsKey, (current = []) =>
        withFavorite(current, gestureId, favorite)
      );
    },
    onSettled: async () => {
      // Refetch once the last flip settles, so a refetch cannot undo a
      // flip still in flight.
      if (queryClient.isMutating({ mutationKey: SET_FAVORITE_KEY }) === 1) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: rpc.ids.key() }),
          queryClient.invalidateQueries({ queryKey: rpc.list.key() }),
        ]);
      }
    },
  });
  const { mutateAsync } = mutation;

  const idSet = useMemo(
    () => (ids.data ? new Set(ids.data) : undefined),
    [ids.data]
  );
  const toggle = useCallback(
    async (gestureId: string) => {
      const current = queryClient.getQueryData<string[]>(idsKey) ?? [];
      const favorite = !current.includes(gestureId);
      // analytics: gesture_collection_changed {action: favorite ? "added" : "removed", collection: "favorites", gesture_id}
      await mutateAsync({ favorite, gestureId });
    },
    [idsKey, mutateAsync, queryClient]
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
 * Signed in, `toggle` flips the ids optimistically, rolls back on error
 * and refetches `favorites.ids` and `favorites.list` once settled.
 */
export function useFavorites({
  items = true,
}: UseFavoritesOptions = {}): Favorites {
  const auth = useAuthState();
  const signedIn = auth.status === "signedIn";
  const account = useAccountFavorites(
    signedIn ? auth.user?.id : undefined,
    items
  );
  const guest = useGuestFavorites(auth.status === "signedOut", items);
  if (auth.status === "loading") {
    return LOADING;
  }
  return signedIn ? account : guest;
}
