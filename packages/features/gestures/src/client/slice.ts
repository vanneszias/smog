import { type RpcQueryUtils, useRpcQuery } from "@smog/rpc/react";
import type { GesturesContract } from "../contract";

/** The contract slice these hooks know, keyed as `appContract` mounts it. */
interface GesturesSlice {
  gestures: GesturesContract;
}

/** Gestures, their details and related rows change rarely (admin edits). */
export const CATALOG_STALE_TIME = 5 * 60_000;
/** Categories change even more rarely. */
export const CATEGORIES_STALE_TIME = 60 * 60_000;
/** Search results for the same query and filter. */
export const SEARCH_STALE_TIME = 60_000;

/** The TanStack Query utils for `gestures.*` (see `@smog/rpc/react`). */
export function useGesturesRpc(): RpcQueryUtils<GesturesSlice>["gestures"] {
  return useRpcQuery<GesturesSlice>().gestures;
}

/**
 * A category filter as sent: sorted, so equal filters share one cache
 * entry; empty means none.
 */
export function normalizeCategoryFilter(
  category: readonly string[] | undefined
): string[] | undefined {
  return category && category.length > 0 ? [...category].sort() : undefined;
}
