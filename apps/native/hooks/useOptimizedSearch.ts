import { useCallback, useEffect, useState } from "react";
import { useSearchGestures } from "@/hooks/useGestureData";
import type { Gesture } from "@/types";

const MAX_SEARCH_RESULTS = 1000;

interface UseOptimizedSearchOptions {
  debounceMs?: number;
  displayPageSize?: number;
  enableCache?: boolean;
  minSearchLength?: number;
}

interface UseOptimizedSearchReturn {
  clearSearch: () => void;
  hasMore: boolean;
  isLoading: boolean;
  isSearching: boolean;
  loadMore: () => void;
  refresh: () => void;
  results: Gesture[];
  search: (query: string, categories?: string[]) => void;
  searchStats: {
    totalResults: number;
    filteredResults: number;
    searchTime: number;
    cacheHit: boolean;
  };
}

export const useOptimizedSearch = (
  options: UseOptimizedSearchOptions = {}
): UseOptimizedSearchReturn => {
  const {
    debounceMs = 300,
    minSearchLength = 2,
    displayPageSize = 50,
  } = options;
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [debouncedCategories, setDebouncedCategories] = useState<string[]>([]);
  const [searchStartedAt, setSearchStartedAt] = useState(Date.now());
  const [visibleCount, setVisibleCount] = useState(displayPageSize);
  const [searchTime, setSearchTime] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchStartedAt(Date.now());
      setDebouncedQuery(query);
      setDebouncedCategories(categories);
      setVisibleCount(displayPageSize);
    }, debounceMs);

    return () => clearTimeout(timeout);
  }, [categories, debounceMs, displayPageSize, query]);

  const { results, isLoading, isSearching } = useSearchGestures({
    categories: debouncedCategories,
    limit: MAX_SEARCH_RESULTS,
    minSearchLength,
    query: debouncedQuery,
  });

  useEffect(() => {
    if (!isSearching) {
      setSearchTime(Date.now() - searchStartedAt);
    }
  }, [isSearching, searchStartedAt]);

  const search = useCallback(
    (nextQuery: string, nextCategories: string[] = []) => {
      setQuery(nextQuery);
      setCategories(nextCategories);
    },
    []
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setCategories([]);
    setDebouncedQuery("");
    setDebouncedCategories([]);
    setVisibleCount(displayPageSize);
  }, [displayPageSize]);

  const loadMore = useCallback(() => {
    setVisibleCount((current) => current + displayPageSize);
  }, [displayPageSize]);

  const refresh = useCallback(() => {
    setSearchStartedAt(Date.now());
    setDebouncedQuery(query);
    setDebouncedCategories(categories);
  }, [categories, query]);

  const displayedResults = results.slice(0, visibleCount);

  return {
    clearSearch,
    hasMore: displayedResults.length < results.length,
    isLoading,
    isSearching,
    loadMore,
    refresh,
    results: displayedResults,
    search,
    searchStats: {
      cacheHit: false,
      filteredResults: displayedResults.length,
      searchTime,
      totalResults: results.length,
    },
  };
};
