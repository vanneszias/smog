import type { GesturesContract } from "@smog/gestures/contract";
import {
  type RpcClient,
  type RpcQueryUtils,
  useRpcClient,
  useRpcQuery,
} from "@smog/rpc/react";
import type { ListsContract } from "../contract";

/** The contract slice these hooks know, keyed as `appContract` mounts it. */
export interface ListsSlice {
  /** Guest lists hydrate their ids with `gestures.byIds`. */
  gestures: Pick<GesturesContract, "byIds">;
  lists: ListsContract;
}

/** The owner's lists and details: changed by the owner (and editors). */
export const LISTS_STALE_TIME = 60_000;
/** A shared list may change under the viewer (edit links). */
export const SHARED_LIST_STALE_TIME = 30_000;
/** `gestures.byIds` takes at most this many ids per call. */
export const BY_IDS_CHUNK = 100;

/**
 * A query key scoped to the signed-in user: another account signing in on
 * the same device never sees this one's cached lists. It extends the oRPC
 * key, so `rpc.key()` still invalidates it.
 */
export function forUser<TKey extends readonly unknown[]>(
  key: TKey,
  userId: string | undefined
): readonly [...TKey, { user: string | null }] {
  return [...key, { user: userId ?? null }];
}

export function useListsRpc(): RpcQueryUtils<ListsSlice>["lists"] {
  return useRpcQuery<ListsSlice>().lists;
}

export function useListsClient(): RpcClient<ListsSlice> {
  return useRpcClient<ListsSlice>();
}
