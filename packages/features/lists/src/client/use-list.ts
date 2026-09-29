import { isDefinedError } from "@orpc/client";
import { useAuthState } from "@smog/auth/react";
import {
  addToList,
  deleteList,
  type GuestData,
  removeFromList,
  reorderList,
  selectList,
} from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { z } from "zod";
import {
  isLocalListId,
  type ListDetail,
  listDescriptionSchema,
  listNameSchema,
} from "../schema";
import {
  editLocalList,
  fetchSummaries,
  toLocalItems,
  toLocalSummary,
} from "./local";
import {
  forUser,
  LISTS_STALE_TIME,
  useListsClient,
  useListsRpc,
} from "./slice";
import { type ListsStatus, queryStatus } from "./use-lists";

const updateInputSchema = z.object({
  description: listDescriptionSchema.optional(),
  name: listNameSchema.optional(),
});

export type UpdateListInput = z.input<typeof updateInputSchema>;

export interface UseListResult {
  addItem: (gestureId: string) => Promise<void>;
  error: unknown;
  /** The detail; `undefined` while loading or when it is not the user's. */
  list: ListDetail | undefined;
  /** Unknown, deleted, someone else's, or a server list for a guest. */
  notFound: boolean;
  /** Deletes the list. */
  remove: () => Promise<void>;
  /** Removes a gesture (optimistic for accounts). */
  removeItem: (gestureId: string) => Promise<void>;
  /**
   * Sets the order: exactly the list's current gestures. Optimistic for
   * accounts; rolled back on `INVALID_STATE` or any failure.
   */
  reorder: (gestureIds: readonly string[]) => Promise<void>;
  status: ListsStatus;
  update: (input: UpdateListInput) => Promise<void>;
}

function reordered(detail: ListDetail, gestureIds: readonly string[]) {
  const byId = new Map(detail.items.map((item) => [item.id, item]));
  return {
    ...detail,
    items: gestureIds.flatMap((id, position) => {
      const item = byId.get(id);
      return item ? [{ ...item, position }] : [];
    }),
  };
}

function withoutItem(detail: ListDetail, gestureId: string): ListDetail {
  const items = detail.items
    .filter((item) => item.id !== gestureId)
    .map((item, position) => ({ ...item, position }));
  return { ...detail, itemCount: items.length, items };
}

/**
 * One list with its gestures and mutations. A `loc_` id is a guest list on
 * the device; any other id is the signed-in owner's list from the API.
 */
export function useList(id: string): UseListResult {
  const local = isLocalListId(id);
  const auth = useAuthState();
  const signedIn = auth.status === "signedIn";
  const rpc = useListsRpc();
  const client = useListsClient();
  const queryClient = useQueryClient();
  const store = useLocalStoreInstance();

  // Guest list: the device holds the ids, the API the gesture summaries.
  const selectLocal = useCallback(
    (data: GuestData) => selectList(data, id),
    [id]
  );
  const localList = useLocalStore(selectLocal);
  const localIds = localList?.gestureIds ?? [];
  // Keyed by the set, so a reorder or a removal does not refetch.
  const idSet = [...new Set(localIds)].sort();
  const summaries = useQuery({
    enabled: local && idSet.length > 0,
    placeholderData: keepPreviousData,
    queryFn: () => fetchSummaries(client, idSet),
    queryKey: ["lists", "local-items", idSet],
    staleTime: LISTS_STALE_TIME,
  });

  const detailKey = forUser(rpc.get.queryKey({ input: { id } }), auth.user?.id);
  const remote = useQuery({
    ...rpc.get.queryOptions({
      input: { id },
      retry: (count, error) => !isDefinedError(error) && count < 2,
      staleTime: LISTS_STALE_TIME,
    }),
    enabled: !local && signedIn,
    queryKey: detailKey,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: rpc.key() }),
    [queryClient, rpc]
  );

  /** An optimistic edit of the cached detail, rolled back on failure. */
  const optimistic = useCallback(
    async <T>(
      change: (detail: ListDetail) => ListDetail,
      run: () => Promise<T>
    ): Promise<void> => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<ListDetail>(detailKey);
      if (previous) {
        queryClient.setQueryData<ListDetail>(detailKey, change(previous));
      }
      try {
        await run();
      } catch (error) {
        queryClient.setQueryData(detailKey, previous);
        throw error;
      } finally {
        await invalidate();
      }
    },
    [detailKey, invalidate, queryClient]
  );

  const { mutateAsync: addRemote } = useMutation(rpc.addItem.mutationOptions());
  const { mutateAsync: removeRemote } = useMutation(
    rpc.removeItem.mutationOptions()
  );
  const { mutateAsync: reorderRemote } = useMutation(
    rpc.reorder.mutationOptions()
  );
  const { mutateAsync: updateRemote } = useMutation(
    rpc.update.mutationOptions()
  );
  const { mutateAsync: deleteRemote } = useMutation(
    rpc.delete.mutationOptions()
  );

  const addItem = useCallback(
    async (gestureId: string) => {
      // analytics: gesture_collection_changed { action: "added", collection: "list" }
      if (local) {
        await store.update(addToList(id, gestureId));
        return;
      }
      try {
        await addRemote({ gestureId, id });
      } finally {
        await invalidate();
      }
    },
    [addRemote, id, invalidate, local, store]
  );

  const removeItem = useCallback(
    async (gestureId: string) => {
      // analytics: gesture_collection_changed { action: "removed", collection: "list" }
      if (local) {
        await store.update(removeFromList(id, gestureId));
        return;
      }
      await optimistic(
        (detail) => withoutItem(detail, gestureId),
        () => removeRemote({ gestureId, id })
      );
    },
    [id, local, optimistic, removeRemote, store]
  );

  const reorder = useCallback(
    async (gestureIds: readonly string[]) => {
      if (local) {
        await store.update(reorderList(id, gestureIds));
        return;
      }
      await optimistic(
        (detail) => reordered(detail, gestureIds),
        () => reorderRemote({ gestureIds: [...gestureIds], id })
      );
    },
    [id, local, optimistic, reorderRemote, store]
  );

  const update = useCallback(
    async (input: UpdateListInput) => {
      if (local) {
        const parsed = updateInputSchema.parse(input);
        await store.update(
          editLocalList(id, {
            ...(parsed.name === undefined ? {} : { name: parsed.name }),
            ...(parsed.description === undefined
              ? {}
              : { description: parsed.description }),
          })
        );
        return;
      }
      try {
        await updateRemote({ ...input, id });
      } finally {
        await invalidate();
      }
    },
    [id, invalidate, local, store, updateRemote]
  );

  const remove = useCallback(async () => {
    if (local) {
      await store.update(deleteList(id));
      return;
    }
    await deleteRemote({ id });
    queryClient.removeQueries({ queryKey: detailKey });
    await invalidate();
  }, [deleteRemote, detailKey, id, invalidate, local, queryClient, store]);

  const mutations = { addItem, remove, removeItem, reorder, update };

  if (local) {
    if (!localList) {
      return {
        ...mutations,
        error: null,
        list: undefined,
        notFound: true,
        status: "ready",
      };
    }
    const loading = idSet.length > 0 && summaries.data === undefined;
    return {
      ...mutations,
      error: summaries.error,
      list: {
        ...toLocalSummary(localList),
        items: toLocalItems(localIds, summaries.data ?? []),
      },
      notFound: false,
      status: loading ? queryStatus(summaries) : "ready",
    };
  }
  if (auth.status === "loading") {
    return {
      ...mutations,
      error: null,
      list: undefined,
      notFound: false,
      status: "loading",
    };
  }
  if (!signedIn) {
    return {
      ...mutations,
      error: null,
      list: undefined,
      notFound: true,
      status: "ready",
    };
  }
  const notFound =
    isDefinedError(remote.error) && remote.error.code === "NOT_FOUND";
  return {
    ...mutations,
    error: remote.error,
    list: remote.data,
    notFound,
    status: notFound ? "ready" : queryStatus(remote),
  };
}
