// biome-ignore-all lint/performance/noBarrelFile: the `@smog/gestures/client` entry point (site + mobile).
/**
 * `@smog/gestures/client`: platform-neutral hooks (TanStack Query over the
 * typed `gestures` slice, and the local store for recent searches), plus
 * the pure ranking for the mobile offline cache. Never imports ./server.
 */
export {
  type Ranked,
  type RankOptions,
  rankGestures,
  type SearchableGesture,
  shouldRunTypoTier,
  typoMatches,
} from "../ranking";
export {
  categoriesOptions,
  type GestureSearchInput,
  type GesturesQueryUtils,
  gestureOptions,
  gestureSearchOptions,
  gesturesBrowseOptions,
  gesturesPageOptions,
  relatedOptions,
} from "./options";
export {
  CATALOG_STALE_TIME,
  CATEGORIES_STALE_TIME,
  SEARCH_STALE_TIME,
} from "./slice";
export { useCategories } from "./use-categories";
export { useGesture } from "./use-gesture";
export {
  SEARCH_DEBOUNCE_MS,
  type UseGestureSearchOptions,
  useGestureSearch,
} from "./use-gesture-search";
export { type UseGesturesOptions, useGestures } from "./use-gestures";
export { type RecentSearches, useRecentSearches } from "./use-recent-searches";
export { useRelated } from "./use-related";
