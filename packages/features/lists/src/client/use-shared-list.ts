import { isDefinedError } from "@orpc/client";
import { useAuthState } from "@smog/auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { SharedList } from "../schema";
import {
  type ListsQueryUtils,
  SHARED_LIST_STALE_TIME,
  useListsRpc,
} from "./slice";
import { type ListsStatus, queryStatus } from "./use-lists";

/**
 * The shared list's query options, for the hook and for SSR prefetches
 * (`ensureQueryData(sharedListOptions(utils.lists, token))`), so both build
 * the same key. A defined error (`NOT_FOUND`) is not retried.
 */
export function sharedListOptions(utils: ListsQueryUtils, token: string) {
  return utils.shared.get.queryOptions({
    input: { token },
    retry: (count, error) => !isDefinedError(error) && count < 2,
    staleTime: SHARED_LIST_STALE_TIME,
  });
}

export interface UseSharedListResult {
  /** Adds through the edit link (needs `canEdit`). */
  addItem: (gestureId: string) => Promise<void>;
  /** An edit link and a signed-in user. */
  canEdit: boolean;
  data: SharedList | undefined;
  error: unknown;
  /** Unknown or revoked link (or a private list). */
  notFound: boolean;
  removeItem: (gestureId: string) => Promise<void>;
  /** An edit link opened by a guest: editing needs sign-in first. */
  requiresSignIn: boolean;
  status: ListsStatus;
}

/**
 * A list behind a share link (`/lists/<token>`). Viewing needs no
 * account; editing needs an edit link and a session.
 */
export function useSharedList(token: string): UseSharedListResult {
  const auth = useAuthState();
  const signedIn = auth.status === "signedIn";
  const rpc = useListsRpc();
  const queryClient = useQueryClient();
  const shared = useQuery(sharedListOptions(rpc, token));
  const { mutateAsync: addRemote } = useMutation(
    rpc.shared.addItem.mutationOptions()
  );
  const { mutateAsync: removeRemote } = useMutation(
    rpc.shared.removeItem.mutationOptions()
  );
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: rpc.key() }),
    [queryClient, rpc]
  );

  const addItem = useCallback(
    async (gestureId: string) => {
      // analytics: gesture_collection_changed { action: "added", collection: "list" }
      try {
        await addRemote({ gestureId, token });
      } finally {
        await invalidate();
      }
    },
    [addRemote, invalidate, token]
  );
  const removeItem = useCallback(
    async (gestureId: string) => {
      // analytics: gesture_collection_changed { action: "removed", collection: "list" }
      try {
        await removeRemote({ gestureId, token });
      } finally {
        await invalidate();
      }
    },
    [invalidate, removeRemote, token]
  );

  const editLink = shared.data?.role === "edit";
  const notFound =
    isDefinedError(shared.error) && shared.error.code === "NOT_FOUND";
  return {
    addItem,
    canEdit: editLink && signedIn,
    data: shared.data,
    error: shared.error,
    notFound,
    removeItem,
    requiresSignIn: editLink && auth.status === "signedOut",
    status: notFound ? "ready" : queryStatus(shared),
  };
}
