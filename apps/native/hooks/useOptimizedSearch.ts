import { searchGestures } from "@smog/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gestureService } from "@/services/gestureService";
import type { Gesture } from "@/types";

interface UseOptimizedSearchOptions {
  debounceMs?: number;
  minSearchLength?: number;
  displayPageSize?: number;
  enableCache?: boolean;
}

interface UseOptimizedSearchReturn {
  results: Gesture[];
  isLoading: boolean;
  isSearching: boolean;
  search: (query: string, categories?: string[]) => void;
  clearSearch: () => void;
  refresh: () => void;
  hasMore: boolean;
  loadMore: () => void;
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
    displayPageSize = 20,
  } = options;

  // All gestures loaded from the database
  const [allGestures, setAllGestures] = useState<Gesture[]>([]);
  // Filtered gestures based on search query and categories
  const [filteredGestures, setFilteredGestures] = useState<Gesture[]>([]);
  // Currently displayed results (paginated view of filtered results)
  const [results, setResults] = useState<Gesture[]>([]);
  // Current page for display pagination
  const [currentPage, setCurrentPage] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStats, setSearchStats] = useState({
    totalResults: 0,
    filteredResults: 0,
    searchTime: 0,
    cacheHit: false,
  });

  const debounceRef = useRef<number | null>(null);
  const lastQueryRef = useRef<string>("");
  const lastCategoriesRef = useRef<string[] | undefined>(undefined);
  const searchStartTimeRef = useRef<number>(0);

  // Load all gestures once on mount
  useEffect(() => {
    const loadAllGestures = async () => {
      setIsLoading(true);
      try {
        const allData = await gestureService.getAllGestures();
        console.log(
          "[useOptimizedSearch] Loaded",
          allData.length,
          "total gestures"
        );
        setAllGestures(allData);
      } catch (error) {
        console.error("[useOptimizedSearch] Error loading gestures:", error);
        setAllGestures([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllGestures();
  }, []);

  // Filter gestures based on search query and categories
  const filterGestures = useCallback(
    (query: string, categories?: string[]) => {
      if (allGestures.length === 0) {
        return [];
      }

      let filtered = allGestures;

      // Filter by categories first
      if (categories && categories.length > 0) {
        filtered = filtered.filter((gesture) =>
          gesture.category.some((cat) => categories.includes(cat))
        );
      }

      // Apply search with relevance ranking if query meets minimum length
      if (query && query.length >= minSearchLength) {
        // Use the new search algorithm with fuzzy matching and relevance ranking
        filtered = searchGestures(filtered, query) as Gesture[];
      }

      return filtered;
    },
    [allGestures, minSearchLength]
  );

  // Update paginated results when filtered gestures change
  const updateDisplayedResults = useCallback(() => {
    const startIndex = 0;
    const endIndex = (currentPage + 1) * displayPageSize;
    const pageResults = filteredGestures.slice(startIndex, endIndex);
    setResults(pageResults);
  }, [filteredGestures, currentPage, displayPageSize]);

  // Debounced search function
  const performSearch = useCallback(
    (query: string, categories?: string[]) => {
      setIsSearching(true);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        // Check if query changed during debounce
        if (
          lastQueryRef.current !== query ||
          JSON.stringify(lastCategoriesRef.current) !==
            JSON.stringify(categories)
        ) {
          return;
        }

        searchStartTimeRef.current = Date.now();

        try {
          const filtered = filterGestures(query, categories);
          const searchTime = Date.now() - searchStartTimeRef.current;

          console.log(
            "[useOptimizedSearch] Filtered",
            filtered.length,
            "gestures from",
            allGestures.length,
            "total"
          );

          setFilteredGestures(filtered);
          setCurrentPage(0); // Reset to first page

          setSearchStats({
            totalResults: allGestures.length,
            filteredResults: filtered.length,
            searchTime,
            cacheHit: true, // Always cache hit since we work with local data
          });
        } catch (error) {
          console.error("[useOptimizedSearch] Filter error:", error);
          setFilteredGestures([]);
          setSearchStats({
            totalResults: allGestures.length,
            filteredResults: 0,
            searchTime: 0,
            cacheHit: false,
          });
        } finally {
          setIsSearching(false);
        }
      }, debounceMs);
    },
    [filterGestures, debounceMs, allGestures.length]
  );

  // Update displayed results when filtered gestures or current page changes
  useEffect(() => {
    updateDisplayedResults();
  }, [updateDisplayedResults]);

  // Main search function
  const search = useCallback(
    (query: string, categories?: string[]) => {
      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Store current query for comparison
      lastQueryRef.current = query;
      lastCategoriesRef.current = categories;

      // If query is empty and no categories, show all gestures
      if (query.length === 0 && (!categories || categories.length === 0)) {
        setFilteredGestures(allGestures);
        setCurrentPage(0);
        setIsSearching(false);
        setSearchStats({
          totalResults: allGestures.length,
          filteredResults: allGestures.length,
          searchTime: 0,
          cacheHit: true,
        });
        return;
      }

      // If query is empty but has categories, filter by categories only
      if (query.length === 0 && categories && categories.length > 0) {
        const filtered = filterGestures("", categories);
        setFilteredGestures(filtered);
        setCurrentPage(0);
        setIsSearching(false);
        setSearchStats({
          totalResults: allGestures.length,
          filteredResults: filtered.length,
          searchTime: 0,
          cacheHit: true,
        });
        return;
      }

      // If query is too short, clear results
      if (query.length < minSearchLength) {
        setFilteredGestures([]);
        setResults([]);
        setCurrentPage(0);
        setIsSearching(false);
        setSearchStats({
          totalResults: allGestures.length,
          filteredResults: 0,
          searchTime: 0,
          cacheHit: true,
        });
        return;
      }

      performSearch(query, categories);
    },
    [allGestures, filterGestures, performSearch, minSearchLength]
  );

  // Clear search results
  const clearSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setFilteredGestures([]);
    setResults([]);
    setCurrentPage(0);
    setIsSearching(false);
    setSearchStats({
      totalResults: allGestures.length,
      filteredResults: 0,
      searchTime: 0,
      cacheHit: true,
    });
    lastQueryRef.current = "";
    lastCategoriesRef.current = undefined;
  }, [allGestures.length]);

  // Refresh data by reloading all gestures
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await gestureService.refreshData();
      const allData = await gestureService.getAllGestures();
      setAllGestures(allData);

      // Re-run current search if there was one
      if (lastQueryRef.current || lastCategoriesRef.current) {
        search(lastQueryRef.current, lastCategoriesRef.current);
      }
    } catch (error) {
      console.error("[useOptimizedSearch] Refresh error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  // Load more results (increase page)
  const loadMore = useCallback(() => {
    const maxPossiblePages = Math.ceil(
      filteredGestures.length / displayPageSize
    );
    if (currentPage + 1 < maxPossiblePages) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [currentPage, filteredGestures.length, displayPageSize]);

  // Check if there are more results to load
  const hasMore = useMemo(() => {
    const maxPossiblePages = Math.ceil(
      filteredGestures.length / displayPageSize
    );
    return currentPage + 1 < maxPossiblePages;
  }, [currentPage, filteredGestures.length, displayPageSize]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    []
  );

  return {
    results,
    isLoading,
    isSearching,
    search,
    clearSearch,
    refresh,
    hasMore,
    loadMore,
    searchStats,
  };
};

// Hook for category-based search
export const useCategorySearch = (category?: string) => {
  const [results, setResults] = useState<Gesture[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const searchByCategory = useCallback(
    async (cat?: string) => {
      const targetCategory = cat || category;
      if (!targetCategory) {
        return;
      }

      setIsLoading(true);
      try {
        const categoryResults =
          await gestureService.getGesturesByCategory(targetCategory);
        setResults(categoryResults);
      } catch (error) {
        console.error("Category search error:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [category]
  );

  useEffect(() => {
    if (category) {
      searchByCategory(category);
    }
  }, [category, searchByCategory]);

  return {
    results,
    isLoading,
    searchByCategory,
  };
};

// Hook for recent searches
export const useRecentSearches = (maxRecent = 10) => {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const addRecentSearch = useCallback(
    (query: string) => {
      if (!query.trim()) {
        return;
      }

      setRecentSearches((prev) => {
        const filtered = prev.filter((item) => item !== query);
        return [query, ...filtered].slice(0, maxRecent);
      });
    },
    [maxRecent]
  );

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
  }, []);

  return {
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
  };
};
