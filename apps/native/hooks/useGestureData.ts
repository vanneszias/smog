import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { useQuery } from "convex/react";
import { useDeferredValue, useMemo } from "react";
import type { Gesture } from "@/types";

const DEFAULT_SEARCH_LIMIT = 50;

export function useCategories(): string[] | undefined {
  const categories = useQuery(api.categories.list, {});
  return useMemo(
    () => categories?.map((category) => category.name).sort(),
    [categories]
  );
}

export function useGesture(
  gestureId: string | undefined
): Gesture | null | undefined {
  return useQuery(
    api.gestures.getByIdForNative,
    gestureId ? { id: gestureId as Id<"gestures"> } : "skip"
  ) as Gesture | null | undefined;
}

export function useGesturesByIds(ids: string[]): Gesture[] | undefined {
  const stableIds = useMemo(() => ids.map((id) => id as Id<"gestures">), [ids]);
  return useQuery(
    api.gestures.getByIdsForNative,
    stableIds.length > 0 ? { ids: stableIds } : "skip"
  ) as Gesture[] | undefined;
}

export function useRelatedGestures(
  gestureId: string | undefined,
  limit = 5
): Gesture[] | undefined {
  return useQuery(
    api.gestures.relatedForNative,
    gestureId ? { gestureId: gestureId as Id<"gestures">, limit } : "skip"
  ) as Gesture[] | undefined;
}

export function useSearchGestures({
  query,
  categories,
  limit = DEFAULT_SEARCH_LIMIT,
  minSearchLength = 1,
}: {
  query: string;
  categories: string[];
  limit?: number;
  minSearchLength?: number;
}): {
  results: Gesture[];
  isLoading: boolean;
  isSearching: boolean;
} {
  const trimmedQuery = query.trim();
  const deferredQuery = useDeferredValue(trimmedQuery);
  const deferredCategories = useDeferredValue(categories);
  const shouldSearch =
    deferredQuery.length >= minSearchLength || deferredCategories.length > 0;

  const results = useQuery(
    api.gestures.searchForNative,
    shouldSearch
      ? {
          searchText: deferredQuery,
          categories: deferredCategories,
          limit,
        }
      : "skip"
  ) as Gesture[] | undefined;

  const isDeferred =
    deferredQuery !== trimmedQuery || deferredCategories !== categories;

  return {
    results: shouldSearch ? (results ?? []) : [],
    isLoading: shouldSearch && results === undefined,
    isSearching: shouldSearch && (results === undefined || isDeferred),
  };
}
