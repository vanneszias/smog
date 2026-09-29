import { useQuery } from "@tanstack/react-query";
import { CATALOG_STALE_TIME, useGesturesRpc } from "./slice";

/**
 * One gesture by slug or legacy id (`NOT_FOUND` as a typed error). The web
 * route 301s when `data.canonicalSlug` differs from the slug it asked for.
 */
export function useGesture(slug: string) {
  const gestures = useGesturesRpc();
  return useQuery(
    gestures.bySlug.queryOptions({
      input: { slug },
      staleTime: CATALOG_STALE_TIME,
    })
  );
}
