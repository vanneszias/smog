import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
}: UseGestureSearchOptions) {
  const gestures = useGesturesRpc();
  const typed = q.trim();
  const settled = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS);
  // analytics: search_performed { query_length, result_count, category_count,
  // has_results } once `data` arrives for `settled`; never the query text.
  const query = useQuery(
    gestures.search.queryOptions({
      input: { category: normalizeCategoryFilter(category), limit, q: settled },
      placeholderData: keepPreviousData,
      staleTime: SEARCH_STALE_TIME,
    })
  );
  return { ...query, isDebouncing: settled !== typed };
}
