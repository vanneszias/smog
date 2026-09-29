import { useAuthState } from "@smog/auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  isLocalListId,
  type ShareLink,
  type ShareLinks,
  type ShareRole,
} from "../schema";
import { forUser, LISTS_STALE_TIME, useListsRpc } from "./slice";
import { type ListsStatus, queryStatus } from "./use-lists";

/** Sharing needs an account (spec §11): guests and guest lists get this. */
export interface ShareLinksRequireAccount {
  requiresAccount: true;
}

export interface ShareLinksState {
  /** The role's active link, created when there is none. */
  create: (role: ShareRole) => Promise<ShareLink>;
  error: unknown;
  links: ShareLinks | undefined;
  /** Revokes the role's link and creates a new one (the old one 404s). */
  regenerate: (role: ShareRole) => Promise<ShareLink>;
  requiresAccount: false;
  /** Revokes the role's link; it stops working at once. */
  revoke: (role: ShareRole) => Promise<void>;
  status: ListsStatus;
}

export type UseShareLinksResult = ShareLinksRequireAccount | ShareLinksState;

/** The owner's view and edit links for a list. */
export function useShareLinks(id: string): UseShareLinksResult {
  const auth = useAuthState();
  const available = auth.status === "signedIn" && !isLocalListId(id);
  const rpc = useListsRpc();
  const queryClient = useQueryClient();
  const options = rpc.share.get.queryOptions({
    input: { id },
    staleTime: LISTS_STALE_TIME,
  });
  const links = useQuery({
    ...options,
    enabled: available,
    queryKey: forUser(options.queryKey, auth.user?.id),
  });
  const { mutateAsync: createRemote } = useMutation(
    rpc.share.create.mutationOptions()
  );
  const { mutateAsync: revokeRemote } = useMutation(
    rpc.share.revoke.mutationOptions()
  );

  // Links and the `shares` flags in `mine`/`get` both change.
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: rpc.key() }),
    [queryClient, rpc]
  );
  const create = useCallback(
    async (role: ShareRole) => {
      try {
        return await createRemote({ id, role });
      } finally {
        await invalidate();
      }
    },
    [createRemote, id, invalidate]
  );
  const revoke = useCallback(
    async (role: ShareRole) => {
      try {
        await revokeRemote({ id, role });
      } finally {
        await invalidate();
      }
    },
    [id, invalidate, revokeRemote]
  );
  const regenerate = useCallback(
    async (role: ShareRole) => {
      await revoke(role);
      return await create(role);
    },
    [create, revoke]
  );

  if (!available) {
    return { requiresAccount: true };
  }
  return {
    create,
    error: links.error,
    links: links.data,
    regenerate,
    requiresAccount: false,
    revoke,
    status: queryStatus(links),
  };
}
