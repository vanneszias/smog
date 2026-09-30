import { useQuery } from "@tanstack/react-query";
import { relatedOptions } from "./options";
import { useGesturesRpc } from "./slice";

/** Gestures sharing categories with `slug` (most shared first). */
export function useRelated(slug: string, limit?: number) {
  return useQuery(relatedOptions(useGesturesRpc(), slug, limit));
}
