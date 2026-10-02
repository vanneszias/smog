import { useQuery } from "@tanstack/react-query";
import { gestureOptions } from "./options";
import { useGesturesRpc } from "./slice";

/**
 * One gesture by slug or legacy id (`NOT_FOUND` as a typed error). The web
 * route 301s when `data.canonicalSlug` differs from the slug it asked for.
 */
export function useGesture(slug: string) {
  return useQuery(gestureOptions(useGesturesRpc(), slug));
}
