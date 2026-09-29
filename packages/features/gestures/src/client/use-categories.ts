import { useQuery } from "@tanstack/react-query";
import { CATEGORIES_STALE_TIME, useGesturesRpc } from "./slice";

/** Published categories in menu order, with their gesture counts. */
export function useCategories() {
  const gestures = useGesturesRpc();
  return useQuery(
    gestures.categories.queryOptions({ staleTime: CATEGORIES_STALE_TIME })
  );
}
