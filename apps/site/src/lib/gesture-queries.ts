import type { ApiQueryUtils } from "@smog/api/client";
import {
  CATALOG_STALE_TIME,
  CATEGORIES_STALE_TIME,
  SEARCH_STALE_TIME,
} from "@smog/gestures/client";
import type { QueryClient } from "@tanstack/react-query";

/*
 * The loaders' prefetches. Each builds exactly the query options (and so
 * the query key) of the `@smog/gestures/client` hook the screen then calls,
 * so the hook reads the dehydrated SSR data instead of fetching again:
 * `useGestureSearch({ q, category, limit: SEARCH_LIMIT })`,
 * `useGestures({ category })`, `useCategories()`, `useGesture(slug)` and
 * `useRelated(slug, limit)`. `e2e/search.spec.ts` checks that a loaded
 * page sends no `gestures/*` request.
 */

/** Search results per request (the contract allows 50). */
export const SEARCH_LIMIT = 48;
/** Featured gestures on the home page (the first of the catalogue). */
export const FEATURED_LIMIT = 8;

/** The hooks' category filter: sorted, `undefined` when empty. */
function categoryFilter(slugs: readonly string[]): string[] | undefined {
  return slugs.length > 0 ? [...slugs].sort() : undefined;
}

function searchOptions(
  utils: ApiQueryUtils,
  q: string,
  categories: readonly string[]
) {
  return utils.gestures.search.queryOptions({
    input: {
      category: categoryFilter(categories),
      limit: SEARCH_LIMIT,
      q: q.trim(),
    },
    staleTime: SEARCH_STALE_TIME,
  });
}

function browseOptions(utils: ApiQueryUtils, categories: readonly string[]) {
  const filter = categoryFilter(categories);
  return utils.gestures.list.infiniteOptions({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    input: (cursor: string | undefined) => ({ category: filter, cursor }),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function categoriesOptions(utils: ApiQueryUtils) {
  return utils.gestures.categories.queryOptions({
    staleTime: CATEGORIES_STALE_TIME,
  });
}

export function featuredOptions(utils: ApiQueryUtils) {
  return utils.gestures.list.queryOptions({
    input: { limit: FEATURED_LIMIT },
    staleTime: CATALOG_STALE_TIME,
  });
}

export function gestureOptions(utils: ApiQueryUtils, slug: string) {
  return utils.gestures.bySlug.queryOptions({
    input: { slug },
    staleTime: CATALOG_STALE_TIME,
  });
}

export function relatedOptions(
  utils: ApiQueryUtils,
  slug: string,
  limit: number
) {
  return utils.gestures.related.queryOptions({
    input: { limit, slug },
    staleTime: CATALOG_STALE_TIME,
  });
}

/**
 * Prefetches the browse page: search results for a query, else the first
 * catalogue page, plus the categories (one D1 read each).
 */
export async function prefetchBrowse(
  queryClient: QueryClient,
  utils: ApiQueryUtils,
  q: string,
  categories: readonly string[]
): Promise<void> {
  await Promise.all([
    q.trim()
      ? queryClient.prefetchQuery(searchOptions(utils, q, categories))
      : queryClient.prefetchInfiniteQuery(browseOptions(utils, categories)),
    queryClient.prefetchQuery(categoriesOptions(utils)),
  ]);
}
