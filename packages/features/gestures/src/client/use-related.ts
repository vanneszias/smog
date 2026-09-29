import { useQuery } from "@tanstack/react-query";
import { CATALOG_STALE_TIME, useGesturesRpc } from "./slice";

/** Gestures sharing categories with `slug` (most shared first). */
export function useRelated(slug: string, limit?: number) {
  const gestures = useGesturesRpc();
  return useQuery(
    gestures.related.queryOptions({
      input: { limit, slug },
      staleTime: CATALOG_STALE_TIME,
    })
  );
}
