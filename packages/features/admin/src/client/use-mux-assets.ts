/**
 * Task 3: `useMuxStatus`, `useMuxAssets`. Everything exported here is part
 * of `@smog/admin/client` (`index.ts` re-exports this file). Both are
 * reads; nothing here writes.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MUX_ASSETS_PAGE_DEFAULT } from "../schema";
import { ADMIN_STALE_TIME, useAdminKey, useAdminRpc } from "./slice";

/** `admin.mux.status`: whether uploads and the picker work (Mux configured). */
export function useMuxStatus() {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  // The configuration only changes with a deploy.
  const options = rpc.mux.status.queryOptions({
    staleTime: Number.POSITIVE_INFINITY,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

export interface UseMuxAssetsOptions {
  /** Off until the picker tab is open (and Mux is configured). */
  enabled?: boolean;
  limit?: number;
  page: number;
}

/**
 * One page of the Mux assets with a public playback id and the gestures
 * that use each (`admin.mux.assets`). The previous page stays on screen
 * while the next loads.
 */
export function useMuxAssets({
  enabled = true,
  limit = MUX_ASSETS_PAGE_DEFAULT,
  page,
}: UseMuxAssetsOptions) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.mux.assets.queryOptions({
    input: { limit, page },
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({
    ...options,
    enabled,
    placeholderData: keepPreviousData,
    queryKey: scoped(options.queryKey),
  });
}
