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
   * accounts; rolled back, and rejected, on failure). A tap before the
   * lists loaded waits for them. `null`: ignored, because a change of
   * that list is still in flight.
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
  const containingOptions = useMemo(
    () => ({
      ...rpc.containing.queryOptions({
        input: { gestureId },
        staleTime: LISTS_STALE_TIME,
      }),
      queryKey: containingKey,
    }),
    [containingKey, gestureId, rpc]
  );
  const containing = useQuery({
    ...containingOptions,
    enabled: signedIn && enabled,
  });
  const { mutateAsync: addRemote } = useMutation(rpc.addItem.mutationOptions());
  const { mutateAsync: removeRemote } = useMutation(
    rpc.removeItem.mutationOptions()
  );

  // Lists with a tap being handled: a second tap on one (even in the same
  // tick) is ignored until the first settles.
  const busy = useRef(new Set<string>());
  // Changes in flight: list id → the state asked for (what `lists` shows).
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

  /**
   * The lists holding the gesture now: the device's, or the cached
   * `containing` (fetched first when a tap comes before it loaded, so the
   * tap is never lost or decided on a guess).
   */
  const currentIds = useCallback(async (): Promise<readonly string[]> => {
    if (!signedIn) {
      return selectLocal(store.getSnapshot());
    }
    return (
      queryClient.getQueryData<string[]>(containingKey) ??
      (await queryClient.fetchQuery(containingOptions))
    );
  }, [
    containingKey,
    containingOptions,
    queryClient,
    selectLocal,
    signedIn,
    store,
  ]);

  const toggle = useCallback(
    async (listId: string): Promise<MembershipChange | null> => {
      if (busy.current.has(listId)) {
        return null;
      }
      busy.current.add(listId);
      let add: boolean;
      try {
        add = !(await currentIds()).includes(listId);
        setInFlight(listId, add);
        await apply(listId, add);
      } finally {
        busy.current.delete(listId);
        setInFlight(listId, undefined);
      }
      const action = add ? "added" : "removed";
      trackListItem(analytics, action, gestureId, source);
      return { action, name: nameOf(listId) };
    },
    [analytics, apply, currentIds, gestureId, nameOf, setInFlight, source]
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

  // Signed in, "contains" is unknown until `containing` answers: every entry
  // is busy then, rather than a guessed "unchecked".
  const unknown = signedIn && containing.data === undefined;
  const entries = useMemo(
    () =>
      lists.map((list) => ({
        contains: pending.get(list.id) ?? serverIds.includes(list.id),
        id: list.id,
        name: list.name,
        pending: unknown || pending.has(list.id),
      })),
    [lists, pending, serverIds, unknown]
  );

  let status: ListsStatus = listsStatus;
  if (signedIn && listsStatus === "ready") {
    status = enabled ? queryStatus(containing) : "loading";
  }
  return { createWith, lists: entries, status, toggle };
}
