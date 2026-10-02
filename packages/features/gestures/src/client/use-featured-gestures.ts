import { useQuery } from "@tanstack/react-query";
import type { GestureSummary } from "../schema";
import { gesturesPageOptions } from "./options";
import { useGesturesRpc } from "./slice";

/** Featured gestures on Home, in both apps (the site prefetches the same key). */
export const FEATURED_LIMIT = 8;

function selectItems(page: { items: GestureSummary[] }): GestureSummary[] {
  return page.items;
}

/**
 * The featured row: the first `limit` gestures of the catalogue, one page
 * (`gesturesPageOptions`, which an SSR loader prefetches with the same
 * limit). `data` is the gestures themselves.
 */
export function useFeaturedGestures(limit: number = FEATURED_LIMIT) {
  return useQuery({
    ...gesturesPageOptions(useGesturesRpc(), limit),
    select: selectItems,
  });
}
