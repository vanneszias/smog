import type { AppContract } from "@smog/api/client";
import { type RpcQueryUtils, useRpcQuery } from "@smog/rpc/react";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export type AppQueryUtils = RpcQueryUtils<AppContract>;

/**
 * An ErrorState's retry: refetches the procedures `select` names (their
 * oRPC keys, e.g. `(rpc) => [rpc.lists.key()]`). The feature hooks keep
 * their queries internal, so a screen retries by key.
 */
export function useRetry(
  select: (rpc: AppQueryUtils) => readonly QueryKey[]
): () => void {
  const rpc = useRpcQuery<AppContract>();
  const queryClient = useQueryClient();
  return useCallback(() => {
    Promise.all(
      select(rpc).map((queryKey) => queryClient.refetchQueries({ queryKey }))
    ).catch((error: unknown) => {
      console.error("[retry] Failed to reload:", error);
    });
  }, [queryClient, rpc, select]);
}
