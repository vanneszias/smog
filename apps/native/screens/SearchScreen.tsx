import { SPACING } from "@smog/styles";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Keyboard,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import EmptyState from "@/components/common/EmptyState";
import SearchHeader from "@/components/search/SearchHeader";
import SearchResults from "@/components/search/SearchResults";
import { useFavorites } from "@/context/FavoritesContext";
import { useRecentSearches } from "@/context/RecentSearchesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useHeaderHeight } from "@/hooks/useHeaderHeight";
import { useOptimizedSearch } from "@/hooks/useOptimizedSearch";
import {
  trackBottomSheetClosed,
  trackBottomSheetOpened,
  trackRecentSearchSelected,
  trackSearchCategoryAdded,
  trackSearchCategoryRemoved,
  trackSearchCleared,
  trackSearchPerformed,
} from "@/services/analyticsService";
import { gestureService } from "@/services/gestureService";

const SearchScreen = () => {
  const router = useRouter();
  const { query: initialQuery, category: initialCategory } =
    useLocalSearchParams<{
      query?: string;
      category?: string;
    }>();
  const { theme } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState(initialQuery || "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory ? [initialCategory] : []
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [isSearchBarFocused, setIsSearchBarFocused] = useState(false);
  const [categorySheetVisible, setCategorySheetVisible] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Screen tracking is now handled automatically by PostHog autocapture

  // Remove a category from selectedCategories
  const handleRemoveCategory = useCallback(
    (category: string) => {
      const newCategories = selectedCategories.filter((c) => c !== category);
      setSelectedCategories(newCategories);
      trackSearchCategoryRemoved(category, newCategories.length);
      router.push({
        pathname: "/search",
        params: {
          query: searchTerm,
          ...(newCategories[0] ? { category: newCategories[0] } : {}),
        },
      });
    },
    [selectedCategories, searchTerm, router]
  );

  const { recentSearches, addRecentSearch } = useRecentSearches();

  const {
    results,
    isLoading,
    isSearching,
    search,
    clearSearch,
    refresh,
    hasMore,
    loadMore,
    searchStats,
  } = useOptimizedSearch({
    debounceMs: 300,
    minSearchLength: 1,
    displayPageSize: 20,
    enableCache: true,
  });

  // Use custom hook for header height calculation
  const {
    headerRef,
    onHeaderLayout,
    onScroll,
    animatedHeaderStyle,
    animatedContentStyle,
  } = useHeaderHeight({
    additionalBottomPadding: SPACING.md, // contentArea paddingTop
    enableAutoHide: true,
    hideThreshold: 50,
    showThreshold: 10,
  });

  useEffect(() => {
    gestureService.getCategories().then(setCategories);
  }, []);

  // Only initialize selectedCategories from initialCategory once
  useEffect(() => {
    if (!hasInitialized) {
      if (initialCategory) {
        setSelectedCategories([initialCategory]);
      }
      setHasInitialized(true);
    }
  }, [initialCategory, hasInitialized]);

  // Trigger search when searchTerm or selectedCategories change (but only after init)
  useEffect(() => {
    if (hasInitialized) {
      // Always trigger search when categories change, even if searchTerm is empty
      if (searchTerm.length === 0) {
        search("", selectedCategories);
      } else if (searchTerm.length >= 1) {
        search(searchTerm, selectedCategories);
      } else {
        clearSearch();
      }
    }
  }, [searchTerm, selectedCategories, hasInitialized, search, clearSearch]);

  // Track search results when they change
  useEffect(() => {
    if (hasInitialized && (searchTerm || selectedCategories.length > 0)) {
      // Only track if we have a search term or categories and got results
      const searchDuration = searchStats.searchTime;
      trackSearchPerformed(
        searchTerm,
        selectedCategories,
        results.length,
        searchDuration
      );
    }
  }, [
    results,
    searchStats.searchTime,
    searchTerm,
    selectedCategories,
    hasInitialized,
  ]);

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchTerm(query);
      router.push({
        pathname: "/search",
        params: {
          query,
          ...(selectedCategories.length > 0
            ? { category: selectedCategories.join(",") }
            : {}),
        },
      });
    },
    [selectedCategories, router]
  );

  const handleSearchSubmit = useCallback(
    (query: string) => {
      if (query.trim()) {
        addRecentSearch(query.trim());
        setIsSearchBarFocused(false);
        Keyboard.dismiss();
        router.push({
          pathname: "/search",
          params: {
            query,
            ...(selectedCategories.length > 0
              ? { category: selectedCategories.join(",") }
              : {}),
          },
        });
      }
    },
    [addRecentSearch, selectedCategories, router]
  );

  const handleClear = useCallback(() => {
    const previousQuery = searchTerm;
    setSearchTerm("");
    clearSearch();
    setIsSearchBarFocused(true);
    trackSearchCleared(previousQuery);
    router.push({
      pathname: "/search",
      params: {},
    });
  }, [clearSearch, router, searchTerm]);

  // Multi-category handler for CategoryListBottomSheet
  const handleCategoryChange = useCallback(
    (categories: string[]) => {
      const previousCategories = selectedCategories;
      const addedCategories = categories.filter(
        (c) => !previousCategories.includes(c)
      );
      const removedCategories = previousCategories.filter(
        (c) => !categories.includes(c)
      );

      // Track category changes
      addedCategories.forEach((category) => {
        trackSearchCategoryAdded(category, categories.length);
      });
      removedCategories.forEach((category) => {
        trackSearchCategoryRemoved(category, categories.length);
      });

      setSelectedCategories(categories);
      setCategorySheetVisible(false);
      trackBottomSheetClosed("category_selection");
      router.push({
        pathname: "/search",
        params: {
          query: searchTerm,
          ...(categories.length > 0 ? { category: categories.join(",") } : {}),
        },
      });
    },
    [searchTerm, router, selectedCategories]
  );

  const handleRecentSearchSelect = useCallback(
    (query: string) => {
      setSearchTerm(query);
      addRecentSearch(query);
      setIsSearchBarFocused(false);
      Keyboard.dismiss();
      trackRecentSearchSelected(query, recentSearches.indexOf(query));
      router.push({
        pathname: "/search",
        params: {
          query,
          ...(selectedCategories[0] ? { category: selectedCategories[0] } : {}),
        },
      });
    },
    [addRecentSearch, selectedCategories, router, recentSearches]
  );

  const handleFocus = useCallback(() => setIsSearchBarFocused(true), []);
  const handleBlur = useCallback(() => setIsSearchBarFocused(false), []);
  const handleShowCategorySheet = useCallback(() => {
    trackBottomSheetOpened("category_selection");
    setCategorySheetVisible(true);
  }, []);
  const handleHideCategorySheet = useCallback(() => {
    trackBottomSheetClosed("category_selection");
    setCategorySheetVisible(false);
  }, []);

  const handleGesturePress = useCallback(
    (gesture: { id: string; name: string; category: string[] }): void => {
      router.push(`/gesture/${gesture.id}`);
    },
    [router]
  );

  const handleRefresh = useCallback(() => {
    if (searchTerm.length >= 2) {
      refresh();
    }
  }, [refresh, searchTerm]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        {/* Header - positioned absolutely at top */}
        <Animated.View
          onLayout={onHeaderLayout}
          ref={headerRef}
          style={[styles.headerContainer, animatedHeaderStyle]}
        >
          <SearchHeader
            categories={categories}
            categorySheetVisible={categorySheetVisible}
            isLoading={isLoading}
            isSearchBarFocused={isSearchBarFocused}
            onBlur={handleBlur}
            onCategoryChange={handleCategoryChange}
            onClear={handleClear}
            onFocus={handleFocus}
            onHideCategorySheet={handleHideCategorySheet}
            onRecentSearchSelect={handleRecentSearchSelect}
            onRemoveCategory={handleRemoveCategory}
            onSearchChange={handleSearchChange}
            onSearchSubmit={handleSearchSubmit}
            onShowCategorySheet={handleShowCategorySheet}
            recentSearches={recentSearches}
            searchTerm={searchTerm}
            selectedCategories={selectedCategories}
          />
        </Animated.View>

        {/* Search Content - expands to full space when header hidden */}
        <Animated.View
          style={[styles.searchContentContainer, animatedContentStyle]}
        >
          {!isLoading && results.length === 0 ? (
            <EmptyState
              message={t("search.noResults", { query: searchTerm })}
            />
          ) : (
            <SearchResults
              hasMore={hasMore}
              initialQuery={searchTerm}
              isFavorite={isFavorite}
              isLoading={isLoading}
              isRefreshing={isSearching}
              onGesturePress={handleGesturePress}
              onLoadMore={loadMore}
              onRefresh={handleRefresh}
              onScroll={onScroll}
              onToggleFavorite={toggleFavorite}
              results={results}
              style={styles.searchResults}
            />
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  content: {
    flex: 1,
  },
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: "transparent",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  searchContentContainer: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  searchResults: {
    flex: 1,
  },
  demoButtons: {
    position: "absolute",
    bottom: 100,
    right: SPACING.md,
    zIndex: 1001,
  },
  demoButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  demoButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default SearchScreen;
