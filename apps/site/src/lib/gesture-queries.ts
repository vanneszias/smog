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

/**
 * Prefetches the browse page, within 3 D1 reads with the session:
 * - a query: the search, then the categories. The search loads this
 *   isolate's catalog snapshot when it is stale, and the categories come
 *   from that snapshot, so they must not run alongside (two cold loads);
 * - no query: the first catalogue page and the categories, together.
 */
export async function prefetchBrowse(
  queryClient: QueryClient,
  utils: ApiQueryUtils,
  q: string,
  categories: readonly string[]
): Promise<void> {
  const loadCategories = () =>
    queryClient.prefetchQuery(categoriesOptions(utils.gestures));
  if (q.trim()) {
    await queryClient.prefetchQuery(
      gestureSearchOptions(utils.gestures, {
        category: categories,
        limit: SEARCH_LIMIT,
        q,
      })
    );
    await loadCategories();
    return;
  }
  await Promise.all([
    queryClient.prefetchInfiniteQuery(
      gesturesBrowseOptions(utils.gestures, { category: categories })
    ),
    loadCategories(),
  ]);
}
