import type { ApiQueryUtils } from "@smog/api/client";
import {
  categoriesOptions,
  gestureSearchOptions,
  gesturesBrowseOptions,
} from "@smog/gestures/client";
import type { QueryClient } from "@tanstack/react-query";

/*
 * The loaders prefetch with the query-option factories of
 * `@smog/gestures/client`, the same ones the hooks call, so the hooks read
 * the dehydrated SSR data instead of fetching again (the feature's
 * `hooks.test.tsx` and `e2e/search.spec.ts` check it).
 */

/** Search results per request (the contract allows 50). */
export const SEARCH_LIMIT = 48;
/** Featured gestures on the home page (the first of the catalogue). */
export const FEATURED_LIMIT = 8;

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
      ? queryClient.prefetchQuery(
          gestureSearchOptions(utils.gestures, {
            category: categories,
            limit: SEARCH_LIMIT,
            q,
          })
        )
      : queryClient.prefetchInfiniteQuery(
          gesturesBrowseOptions(utils.gestures, { category: categories })
        ),
    queryClient.prefetchQuery(categoriesOptions(utils.gestures)),
  ]);
}
