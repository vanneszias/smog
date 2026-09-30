import type { RpcQueryUtils } from "@smog/rpc/react";
import type { GesturesContract } from "../contract";
import {
  CATALOG_STALE_TIME,
  CATEGORIES_STALE_TIME,
  normalizeCategoryFilter,
  SEARCH_STALE_TIME,
} from "./slice";

/**
 * The query options of every gestures hook, as plain factories over the
 * `gestures` query utils. The hooks call them, and so do SSR loaders
 * (`queryClient.ensureQueryData(gestureOptions(utils.gestures, slug))`), so
 * a prefetch builds exactly the key the hook then reads.
 */
export type GesturesQueryUtils = RpcQueryUtils<{
  gestures: GesturesContract;
}>["gestures"];

export interface GestureSearchInput {
  /** Category slugs, OR semantics (any order; sorted for the key). */
  category?: readonly string[] | undefined;
  limit?: number | undefined;
  /** The query (trimmed here); empty returns the browse list. */
  q: string;
}

export function gestureSearchOptions(
  utils: GesturesQueryUtils,
  { category, limit, q }: GestureSearchInput
) {
  return utils.search.queryOptions({
    input: { category: normalizeCategoryFilter(category), limit, q: q.trim() },
    staleTime: SEARCH_STALE_TIME,
  });
}

/** The catalogue in name order, a keyset page at a time. */
export function gesturesBrowseOptions(
  utils: GesturesQueryUtils,
  { category }: { category?: readonly string[] | undefined } = {}
) {
  const filter = normalizeCategoryFilter(category);
  return utils.list.infiniteOptions({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    input: (cursor: string | undefined) => ({ category: filter, cursor }),
    staleTime: CATALOG_STALE_TIME,
  });
}

/** The first `limit` gestures of the catalogue (one page, e.g. featured). */
export function gesturesPageOptions(utils: GesturesQueryUtils, limit: number) {
  return utils.list.queryOptions({
    input: { limit },
    staleTime: CATALOG_STALE_TIME,
  });
}

export function categoriesOptions(utils: GesturesQueryUtils) {
  return utils.categories.queryOptions({ staleTime: CATEGORIES_STALE_TIME });
}

export function gestureOptions(utils: GesturesQueryUtils, slug: string) {
  return utils.bySlug.queryOptions({
    input: { slug },
    staleTime: CATALOG_STALE_TIME,
  });
}

export function relatedOptions(
  utils: GesturesQueryUtils,
  slug: string,
  limit?: number
) {
  return utils.related.queryOptions({
    input: { limit, slug },
    staleTime: CATALOG_STALE_TIME,
  });
}
