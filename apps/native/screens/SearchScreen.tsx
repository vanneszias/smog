import { SPACING } from "@smog/styles";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useCategories } from "@/hooks/useGestureData";
import { useOptimizedSearch } from "@/hooks/useOptimizedSearch";

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
  const categories = useCategories() ?? [];
  const [isSearchBarFocused, setIsSearchBarFocused] = useState(false);
  const [categorySheetVisible, setCategorySheetVisible] = useState(false);
  // Tracks the last category param we acted on so we only react to genuine
  // changes (e.g. navigation from GestureScreen) and not spurious re-renders.
  const prevCategoryParamRef = useRef<string | undefined>(
    initialCategory ?? undefined
  );
  // True once the first search effect has been allowed to fire.
  const [hasInitialized, setHasInitialized] = useState(false);

  const handleRemoveCategory = useCallback(
    (category: string) => {
      const newCategories = selectedCategories.filter((c) => c !== category);
      setSelectedCategories(newCategories);
      prevCategoryParamRef.current = undefined; // reset so nav can set again
    },
    [selectedCategories]
  );

  const handleClearCategories = useCallback(() => {
    setSelectedCategories([]);
    prevCategoryParamRef.current = undefined; // reset so nav can set again
  }, []);

  const { addRecentSearch } = useRecentSearches();

  const {
    results,
    isLoading,
    isSearching,
    search,
    clearSearch,
    refresh,
    hasMore,
    loadMore,
  } = useOptimizedSearch({
    debounceMs: 300,
    minSearchLength: 1,
    displayPageSize: 20,
    enableCache: true,
  });

  // React to category params arriving from navigation (e.g. tapping a category
  // tag in GestureScreen). The search tab is kept mounted by NativeTabs, so
  // the component is never remounted — only the route params change.
  // We compare against prevCategoryParamRef so we only update when the param
  // genuinely changes, never overwriting a user's manual selection on spurious
  // re-renders where initialCategory is still undefined.
  useEffect(() => {
    if (!hasInitialized) {
      // First mount: prime the ref and allow the search effect to run.
      prevCategoryParamRef.current = initialCategory ?? undefined;
      setHasInitialized(true);
      return;
    }
    if (
      initialCategory !== undefined &&
      initialCategory !== prevCategoryParamRef.current
    ) {
      prevCategoryParamRef.current = initialCategory;
      setSelectedCategories([initialCategory]);
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

  const handleSearchChange = useCallback((query: string) => {
    setSearchTerm(query);
  }, []);

  const handleSearchSubmit = useCallback(
    (query: string) => {
      if (query.trim()) {
        addRecentSearch(query.trim());
        setIsSearchBarFocused(false);
        Keyboard.dismiss();
      }
    },
    [addRecentSearch]
  );

  const handleClear = useCallback(() => {
    setSearchTerm("");
    setIsSearchBarFocused(true);
  }, []);

  const handleCategoryChange = useCallback((categoryList: string[]) => {
    setSelectedCategories(categoryList);
    setCategorySheetVisible(false);
  }, []);

  const handleRecentSearchSelect = useCallback(
    (query: string) => {
      setSearchTerm(query);
      addRecentSearch(query);
      setIsSearchBarFocused(false);
      Keyboard.dismiss();
    },
    [addRecentSearch]
  );

  const handleFocus = useCallback(() => setIsSearchBarFocused(true), []);
  const handleBlur = useCallback(() => setIsSearchBarFocused(false), []);
  const handleShowCategorySheet = useCallback(() => {
    setCategorySheetVisible(true);
  }, []);
  const handleHideCategorySheet = useCallback(() => {
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
    <View
      collapsable={false}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
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
                    badgeCount={selectedCategories.length}
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
              badgeCount={selectedCategories.length}
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

      {/* Search results with category filters as header */}
      <View style={styles.contentContainer}>
        {!isLoading && results.length === 0 ? (
          <>
            <CategoryFilters
              onClearCategories={handleClearCategories}
              onRemoveCategory={handleRemoveCategory}
              selectedCategories={selectedCategories}
            />
            <EmptyState
              message={t("search.noResults", { query: searchTerm })}
            />
          </>
        ) : (
          <SearchResults
            hasMore={hasMore}
            initialQuery={searchTerm}
            isFavorite={isFavorite}
            isLoading={isLoading}
            isRefreshing={isSearching}
            ListHeaderComponent={
              <CategoryFilters
                onClearCategories={handleClearCategories}
                onRemoveCategory={handleRemoveCategory}
                selectedCategories={selectedCategories}
              />
            }
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
  contentContainer: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  searchResults: {
    flex: 1,
  },
});

export default SearchScreen;
