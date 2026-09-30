import { useAnalytics } from "@smog/analytics/react";
import { useAuthState } from "@smog/auth/react";
import { type GuestData, removeFromList } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { userScopedKey } from "@smog/rpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { addLocalItem } from "./local";
import {
  LISTS_STALE_TIME,
  type ListItemOptions,
  trackListItem,
  useListsRpc,
} from "./slice";
import { type ListsStatus, queryStatus, useLists } from "./use-lists";

/** One of the user's lists as the "Save to list" picker shows it. */
export interface ListMembershipEntry {
  /** Whether the list holds the gesture (a change in flight shows at once). */
  contains: boolean;
  id: string;
  name: string;
  /** A change of this list is in flight (a tap is ignored meanwhile). */
  pending: boolean;
}

/** What a toggle or a create did, for the toast. */
export interface MembershipChange {
  action: "added" | "removed";
  /** The list's name. */
  name: string;
}

export interface UseListMembershipOptions extends ListItemOptions {
  /** Ask which lists hold the gesture (default `true`); `false` while the picker is closed. */
  enabled?: boolean;
}

export interface UseListMembershipResult {
  /** Creates a list with the gesture in it. */
  createWith: (name: string) => Promise<MembershipChange>;
  /** The user's lists, most recently changed first. */
  lists: ListMembershipEntry[];
  status: ListsStatus;
  /**
   * Adds the gesture to the list or takes it out (optimistic for
   * accounts; rolled back, and rejected, on failure). `null`: ignored,
   * because the list is still loading or a change of it is in flight.
   */
  toggle: (listId: string) => Promise<MembershipChange | null>;
}

const NO_IDS: readonly string[] = [];

/** `ids` with `listId` in it (`contains`) or without it. */
function withList(
  ids: readonly string[],
  listId: string,
  contains: boolean
): string[] {
  const rest = ids.filter((id) => id !== listId);
  return contains ? [...rest, listId] : rest;
}

/**
 * Which of the user's lists hold `gestureId`, with the picker's actions:
 * the "Save to list" logic of both apps. Guests read and write the device
 * lists; signed in, one `lists.containing` query answers every list, and
 * `toggle` lays the change over it at once (`pending`) through
 * `lists.addItem` / `removeItem`, then refetches the lists.
 */
export function useListMembership(
  gestureId: string,
  { enabled = true, source = "gesture_list" }: UseListMembershipOptions = {}
): UseListMembershipResult {
  const analytics = useAnalytics();
  const auth = useAuthState();
  const signedIn = auth.status === "signedIn";
  const userId = auth.user?.id;
  const { create, lists, status: listsStatus } = useLists();
  const rpc = useListsRpc();
  const queryClient = useQueryClient();
  const store = useLocalStoreInstance();

  // Guests: the device lists holding the gesture.
  const selectLocal = useCallback(
    (data: GuestData) =>
      data.lists
        .filter((list) => list.gestureIds.includes(gestureId))
        .map((list) => list.id),
    [gestureId]
  );
  const localIds = useLocalStore(selectLocal);

  // Accounts: one query for every list.
  const containingKey = useMemo(
    () =>
      userScopedKey(rpc.containing.queryKey({ input: { gestureId } }), userId),
    [gestureId, rpc, userId]
  );
  const containing = useQuery({
    ...rpc.containing.queryOptions({
      input: { gestureId },
      staleTime: LISTS_STALE_TIME,
    }),
    enabled: signedIn && enabled,
    queryKey: containingKey,
  });
  const { mutateAsync: addRemote } = useMutation(rpc.addItem.mutationOptions());
  const { mutateAsync: removeRemote } = useMutation(
    rpc.removeItem.mutationOptions()
  );

  // Changes in flight: list id → the state asked for. The ref is the
  // guard (a second tap in the same tick sees the first), the state renders.
  const inFlight = useRef(new Map<string, boolean>());
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(
    () => new Map()
  );
  const setInFlight = useCallback(
    (listId: string, contains: boolean | undefined): void => {
      if (contains === undefined) {
        inFlight.current.delete(listId);
      } else {
        inFlight.current.set(listId, contains);
      }
      setPending(new Map(inFlight.current));
    },
    []
  );

  const serverIds = signedIn ? (containing.data ?? NO_IDS) : localIds;
  const loaded = signedIn ? containing.data !== undefined : true;
  const nameOf = useCallback(
    (listId: string) => lists.find((list) => list.id === listId)?.name ?? "",
    [lists]
  );

  /** Adds or removes on the device or the API; throws on failure. */
  const apply = useCallback(
    async (listId: string, add: boolean): Promise<void> => {
      if (!signedIn) {
        await store.update(
          add
            ? addLocalItem(listId, gestureId)
            : removeFromList(listId, gestureId)
        );
        return;
      }
      try {
        await (add
          ? addRemote({ gestureId, id: listId })
          : removeRemote({ gestureId, id: listId }));
        // Confirmed: into the cache, so nothing flickers until the refetch.
        queryClient.setQueryData<string[]>(containingKey, (current) =>
          current ? withList(current, listId, add) : current
        );
      } finally {
        await queryClient.invalidateQueries({ queryKey: rpc.key() });
      }
    },
    [
      addRemote,
      containingKey,
      gestureId,
      queryClient,
      removeRemote,
      rpc,
      signedIn,
      store,
    ]
  );

  const toggle = useCallback(
    async (listId: string): Promise<MembershipChange | null> => {
      if (!loaded || inFlight.current.has(listId)) {
        return null;
      }
      const add = !serverIds.includes(listId);
      setInFlight(listId, add);
      try {
        await apply(listId, add);
      } finally {
        setInFlight(listId, undefined);
      }
      const action = add ? "added" : "removed";
      trackListItem(analytics, action, gestureId, source);
      return { action, name: nameOf(listId) };
    },
    [
      analytics,
      apply,
      gestureId,
      loaded,
      nameOf,
      serverIds,
      setInFlight,
      source,
    ]
  );

  const createWith = useCallback(
    async (name: string): Promise<MembershipChange> => {
      const created = await create({ name });
      setInFlight(created.id, true);
      try {
        await apply(created.id, true);
      } finally {
        setInFlight(created.id, undefined);
      }
      trackListItem(analytics, "added", gestureId, source);
      return { action: "added", name: created.name };
    },
    [analytics, apply, create, gestureId, setInFlight, source]
  );

  const entries = useMemo(
    () =>
      lists.map((list) => ({
        contains: pending.get(list.id) ?? serverIds.includes(list.id),
        id: list.id,
        name: list.name,
        pending: pending.has(list.id),
      })),
    [lists, pending, serverIds]
  );

  let status: ListsStatus = listsStatus;
  if (signedIn && listsStatus === "ready") {
    status = enabled ? queryStatus(containing) : "loading";
  }
  return { createWith, lists: entries, status, toggle };
}
