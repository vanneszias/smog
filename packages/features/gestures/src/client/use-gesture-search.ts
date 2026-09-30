import { useAnalytics } from "@smog/analytics/react";
import type { SearchSource } from "@smog/analytics/schema";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  normalizeCategoryFilter,
  SEARCH_STALE_TIME,
  useGesturesRpc,
} from "./slice";
import { useDebouncedValue } from "./use-debounced-value";

/** Typing pauses this long before a search is sent (spec §16). */
export const SEARCH_DEBOUNCE_MS = 250;

export interface UseGestureSearchOptions {
  /** Category slugs, OR semantics; applied without debounce. */
  category?: readonly string[] | undefined;
  limit?: number | undefined;
  /** The text as typed; an empty query returns the browse list. */
  q: string;
  /** What `search_performed` reports as its trigger (default `filter_change`). */
  source?: SearchSource | undefined;
}

/**
 * Ranked search results for the settled query. The previous results stay
 * in `data` (`isPlaceholderData`) while the next ones load, so the list
 * does not flash empty; `isDebouncing` is true while typing.
 */
export function useGestureSearch({
  category,
  limit,
  q,
  source = "filter_change",
}: UseGestureSearchOptions) {
  const gestures = useGesturesRpc();
  const analytics = useAnalytics();
  const typed = q.trim();
  const settled = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS);
  const categories = normalizeCategoryFilter(category);
  const query = useQuery(
    gestures.search.queryOptions({
      input: { category: categories, limit, q: settled },
      placeholderData: keepPreviousData,
      staleTime: SEARCH_STALE_TIME,
    })
  );

  // search_performed once the results for `settled` arrive: counts only,
  // never the query text. The browse list (no text, no category) is no search.
  const tracked = useRef<string | null>(null);
  const categoryCount = categories?.length ?? 0;
  const searchKey = `${settled}\u0000${categories?.join(",") ?? ""}\u0000${source}`;
  const total = query.isPlaceholderData ? undefined : query.data?.total;
  useEffect(() => {
    if (
      total === undefined ||
      // A new source while typing waits for its own text to settle.
      settled !== typed ||
      tracked.current === searchKey ||
      (settled === "" && categoryCount === 0)
    ) {
      return;
    }
    tracked.current = searchKey;
    analytics.track({
      name: "search_performed",
      properties: {
        category_count: categoryCount,
        has_results: total > 0,
        query_length: settled.length,
        result_count: total,
        source,
      },
    });
  }, [analytics, categoryCount, searchKey, settled, source, total, typed]);

  return { ...query, isDebouncing: settled !== typed };
}
