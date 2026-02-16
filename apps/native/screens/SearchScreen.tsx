import { SPACING } from "@smog/styles";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import CategoryListBottomSheet from "@/components/bottom-sheet/CategoryListBottomSheet";
import { CircularButton, EmptyState } from "@/components/common";
import CategoryFilters from "@/components/search/CategoryFilters";
import RecentSearches from "@/components/search/RecentSearches";
import SearchBar from "@/components/search/SearchBar";
import SearchResults from "@/components/search/SearchResults";
import { useFavorites } from "@/context/FavoritesContext";
import { useRecentSearches } from "@/context/RecentSearchesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
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

  useEffect(() => {
    gestureService.getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (!hasInitialized) {
      if (initialCategory) {
        setSelectedCategories([initialCategory]);
      }
      setHasInitialized(true);
    }
  }, [initialCategory, hasInitialized]);

  useEffect(() => {
    if (hasInitialized) {
      if (searchTerm.length === 0) {
        search("", selectedCategories);
      } else if (searchTerm.length >= 1) {
        search(searchTerm, selectedCategories);
      } else {
        clearSearch();
      }
    }
  }, [searchTerm, selectedCategories, hasInitialized, search, clearSearch]);

  useEffect(() => {
    if (hasInitialized && (searchTerm || selectedCategories.length > 0)) {
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

  const handleCategoryChange = useCallback(
    (categoryList: string[]) => {
      const previousCategories = selectedCategories;
      const addedCategories = categoryList.filter(
        (c) => !previousCategories.includes(c)
      );
      const removedCategories = previousCategories.filter(
        (c) => !categoryList.includes(c)
      );

      for (const category of addedCategories) {
        trackSearchCategoryAdded(category, categoryList.length);
      }
      for (const category of removedCategories) {
        trackSearchCategoryRemoved(category, categoryList.length);
      }

      setSelectedCategories(categoryList);
      setCategorySheetVisible(false);
      trackBottomSheetClosed("category_selection");
      router.push({
        pathname: "/search",
        params: {
          query: searchTerm,
          ...(categoryList.length > 0
            ? { category: categoryList.join(",") }
            : {}),
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
      router.push(`/gestures/${gesture.id}`);
    },
    [router]
  );

  const handleRefresh = useCallback(() => {
    if (searchTerm.length >= 2) {
      refresh();
    }
  }, [refresh, searchTerm]);

  const isIOS = Platform.OS === "ios";

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Native search bar on iOS via headerSearchBarOptions */}
      <Stack.Screen
        options={{
          title: t("tabs.search"),
          ...(isIOS
            ? {
                headerLargeTitle: true,
                headerLargeTitleStyle: {
                  color: theme.text,
                },
                headerStyle: {
                  backgroundColor: theme.background,
                },
                headerTransparent: true,
                headerBlurEffect: "systemChromeMaterial",
                headerShadowVisible: false,
                headerSearchBarOptions: {
                  placeholder: t("search.placeholder"),
                  autoCapitalize: "none",
                  hideWhenScrolling: false,
                  onChangeText: (e) => handleSearchChange(e.nativeEvent.text),
                  onCancelButtonPress: handleClear,
                  onSearchButtonPress: (e) =>
                    handleSearchSubmit(e.nativeEvent.text),
                  tintColor: theme.primary,
                },
                headerRight: () => (
                  <CircularButton
                    icon="filter"
                    onPress={handleShowCategorySheet}
                    size="small"
                  />
                ),
              }
            : {
                headerShown: false,
              }),
        }}
      />

      {/* Android-only custom search bar */}
      {!isIOS && (
        <View style={styles.androidHeader}>
          <View style={styles.androidSearchRow}>
            <CircularButton
              icon="filter"
              onPress={handleShowCategorySheet}
              size="large"
            />
            <View style={styles.androidSearchBarWrapper}>
              <SearchBar
                isLoading={isLoading}
                onBlur={handleBlur}
                onClear={handleClear}
                onFocus={handleFocus}
                onSearch={handleSearchChange}
                onSubmit={handleSearchSubmit}
                placeholder={t("search.placeholder")}
                value={searchTerm}
              />
            </View>
            <CircularButton
              icon="search"
              onPress={() => handleSearchSubmit(searchTerm)}
              size="large"
            />
          </View>
          <RecentSearches
            onSelect={handleRecentSearchSelect}
            searchTerm={searchTerm}
            visible={isSearchBarFocused}
          />
        </View>
      )}

      {/* Category filter chips */}
      <View style={styles.filtersContainer}>
        <CategoryFilters
          onRemoveCategory={handleRemoveCategory}
          selectedCategories={selectedCategories}
        />
      </View>

      {/* Search results */}
      <View style={styles.resultsContainer}>
        {!isLoading && results.length === 0 ? (
          <EmptyState message={t("search.noResults", { query: searchTerm })} />
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
            onToggleFavorite={toggleFavorite}
            results={results}
            style={styles.searchResults}
          />
        )}
      </View>

      {/* Category bottom sheet (kept — no native equivalent for multi-select) */}
      <CategoryListBottomSheet
        categories={categories}
        onCategoryChange={handleCategoryChange}
        onClose={handleHideCategorySheet}
        selectedCategories={selectedCategories}
        visible={categorySheetVisible}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  androidHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  androidSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: SPACING.sm,
  },
  androidSearchBarWrapper: {
    flex: 1,
  },
  filtersContainer: {
    paddingHorizontal: SPACING.md,
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  searchResults: {
    flex: 1,
  },
});

export default SearchScreen;
