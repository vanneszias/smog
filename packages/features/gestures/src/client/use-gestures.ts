import { useInfiniteQuery } from "@tanstack/react-query";
import { gesturesBrowseOptions } from "./options";
import { useGesturesRpc } from "./slice";

export interface UseGesturesOptions {
  /** Category slugs, OR semantics. */
  category?: readonly string[] | undefined;
}

/**
 * The catalogue in name order, a page at a time (`fetchNextPage`,
 * `hasNextPage`); `data` is every loaded gesture, pages flattened.
 */
export function useGestures({ category }: UseGesturesOptions = {}) {
  return useInfiniteQuery({
    ...gesturesBrowseOptions(useGesturesRpc(), { category }),
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}
