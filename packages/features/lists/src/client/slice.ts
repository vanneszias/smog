import type { Analytics } from "@smog/analytics/react";
import type { CollectionSource } from "@smog/analytics/schema";
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

export function useListsRpc(): RpcQueryUtils<ListsSlice>["lists"] {
  return useRpcQuery<ListsSlice>().lists;
}

export function useListsClient(): RpcClient<ListsSlice> {
  return useRpcClient<ListsSlice>();
}

/** Options of the hooks that add to or remove from a list. */
export interface ListItemOptions {
  /** Where the change happens, for `gesture_collection_changed` (default `gesture_list`). */
  source?: CollectionSource;
}

/** `gesture_collection_changed` for a list item the list really gained or lost. */
export function trackListItem(
  analytics: Analytics,
  action: "added" | "removed",
  gestureId: string,
  source: CollectionSource
): void {
  analytics.track({
    name: "gesture_collection_changed",
    properties: { action, collection: "list", gesture_id: gestureId, source },
  });
}
