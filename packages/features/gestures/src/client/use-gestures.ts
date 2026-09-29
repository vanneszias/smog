import { useInfiniteQuery } from "@tanstack/react-query";
import {
  CATALOG_STALE_TIME,
  normalizeCategoryFilter,
  useGesturesRpc,
} from "./slice";

export interface UseGesturesOptions {
  /** Category slugs, OR semantics. */
  category?: readonly string[] | undefined;
}

/**
 * The catalogue in name order, a page at a time (`fetchNextPage`,
 * `hasNextPage`); `data` is every loaded gesture, pages flattened.
 */
export function useGestures({ category }: UseGesturesOptions = {}) {
  const gestures = useGesturesRpc();
  const filter = normalizeCategoryFilter(category);
  return useInfiniteQuery(
    gestures.list.infiniteOptions({
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
      input: (cursor: string | undefined) => ({ category: filter, cursor }),
      select: (data) => data.pages.flatMap((page) => page.items),
      staleTime: CATALOG_STALE_TIME,
    })
  );
}
