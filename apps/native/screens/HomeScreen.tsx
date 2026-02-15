import { SPACING } from "@smog/styles";
import { useRouter } from "expo-router";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, StyleSheet, type TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import HomeScreenBottomSheetButton from "@/components/bottom-sheet/HomeScreenBottomSheetButton";
import OptionsBottomSheet from "@/components/bottom-sheet/OptionsBottomSheet";
import Logo from "@/components/Logo";
import RecentSearches from "@/components/search/RecentSearches";
// Components
import SearchBar from "@/components/search/SearchBar";
import SearchResults from "@/components/search/SearchResults";
import { useFavorites } from "@/context/FavoritesContext";
import { useRecentSearches } from "@/context/RecentSearchesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useBottomSheet } from "@/hooks/useBottomSheet";
import { useOptimizedSearch } from "@/hooks/useOptimizedSearch";
import { useSettingsModal } from "@/hooks/useSettingsModal";
import {
  trackBottomSheetClosed,
  trackBottomSheetOpened,
  trackRecentSearchSelected,
  trackSearchCleared,
  trackSearchPerformed,
} from "@/services/analyticsService";
import type { Gesture } from "@/types";

const HomeScreen: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { t } = useTranslation();

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Hooks
  const searchHook = useOptimizedSearch({
    debounceMs: 300,
    minSearchLength: 1,
    displayPageSize: 50,
    enableCache: true,
  });

  const { addRecentSearch, recentSearches } = useRecentSearches();
  const bottomSheetHook = useBottomSheet();
  const settingsModalHook = useSettingsModal();

  // Navigation handlers
  const navigateToSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleGesturePress = useCallback(
    (gesture: Gesture) => {
      router.push(`/gestures/${gesture.id}`);
    },
    [router]
  );

  // Track search results when they change
  useEffect(() => {
    if (searchTerm && searchHook.results.length >= 0) {
      // Only track if we have a search term and got results
      const searchDuration = searchHook.searchStats.searchTime;
      trackSearchPerformed(
        searchTerm,
        [],
        searchHook.results.length,
        searchDuration
      );
    }
  }, [searchHook.results, searchHook.searchStats.searchTime, searchTerm]);

  // Search handlers
  const handleSearch = useCallback(
    (query: string) => {
      setSearchTerm(query);

      if (!query.trim()) {
        searchHook.clearSearch();
        return;
      }

      searchHook.search(query);
    },
    [searchHook.search, searchHook.clearSearch]
  );

  const handleSearchSubmit = useCallback(
    (query: string) => {
      if (query.trim()) {
        addRecentSearch(query.trim());
      }
    },
    [addRecentSearch]
  );

  // Handler for selecting a recent search
  const handleRecentSearchSelect = useCallback(
    (query: string) => {
      setSearchTerm(query);
      searchHook.search(query);
      addRecentSearch(query);

      // Track recent search selection
      const position = recentSearches.indexOf(query);
      trackRecentSearchSelected(query, position >= 0 ? position : 0);
    },
    [searchHook, addRecentSearch, recentSearches]
  );

  // Control RecentSearches visibility: show only when searchTerm is empty
  const recentSearchesVisible = searchTerm.length === 0;

  const handleClearSearch = useCallback(() => {
    const previousQuery = searchTerm;
    setSearchTerm("");
    searchHook.clearSearch();
    trackSearchCleared(previousQuery);
  }, [searchHook.clearSearch, searchTerm]);

  // Search focus handlers
  const handleSearchFocus = useCallback(() => {
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    setIsSearchFocused(false);
  }, []);

  const handleSearchCancel = useCallback(() => {
    setIsSearchFocused(false);
  }, []);

  // Bottom sheet handlers
  const handleSettingsPress = useCallback(() => {
    settingsModalHook.handleSettingsPress(navigateToSettings);
  }, [settingsModalHook.handleSettingsPress, navigateToSettings]);

  // Track bottom sheet interactions
  const handleBottomSheetOpen = useCallback(() => {
    trackBottomSheetOpened("options");
    bottomSheetHook.showBottomSheet();
  }, [bottomSheetHook.showBottomSheet]);

  const handleBottomSheetClose = useCallback(() => {
    trackBottomSheetClosed("options");
    bottomSheetHook.hideBottomSheet();
  }, [bottomSheetHook.hideBottomSheet]);

  // Render helpers
  const renderEmptyState = () => <></>;

  const renderSearchResults = () => (
    <SearchResults
      hasMore={searchHook.hasMore}
      initialQuery={searchTerm}
      isFavorite={isFavorite}
      isLoading={searchHook.isLoading}
      isRefreshing={searchHook.isSearching}
      onGesturePress={handleGesturePress}
      onLoadMore={searchHook.loadMore}
      onRefresh={searchHook.refresh}
      onToggleFavorite={toggleFavorite}
      results={searchHook.results}
      style={styles.searchResults}
    />
  );

  // Ref for SearchBar to control focus/blur
  const searchBarRef = useRef<TextInput>(null);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <HomeScreenBottomSheetButton onPress={handleBottomSheetOpen} />
      </View>

      {/* Logo */}
      <View style={styles.logoContainer}>
        <Logo />
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Search bar */}
        <SearchBar
          isLoading={searchHook.isSearching}
          onBlur={handleSearchBlur}
          onCancel={handleSearchCancel}
          onClear={handleClearSearch}
          onFocus={handleSearchFocus}
          onSearch={handleSearch}
          onSubmit={handleSearchSubmit}
          placeholder={t("search.placeholder")}
          ref={searchBarRef}
          showCancelButton={isSearchFocused}
          value={searchTerm}
        />
        {/* Show RecentSearches below SearchBar only when searchTerm is empty */}
        <RecentSearches
          onSelect={(query) => {
            handleRecentSearchSelect(query);
            searchBarRef.current?.blur(); // Remove focus from the search bar
            Keyboard.dismiss(); // Dismiss the keyboard
          }}
          searchTerm={searchTerm}
          visible={recentSearchesVisible}
        />

        {/* Content area */}
        <View style={styles.contentArea}>
          {searchTerm.length === 0 ? renderEmptyState() : renderSearchResults()}
        </View>
      </View>

      {/* Bottom sheet */}
      <OptionsBottomSheet
        onAboutPress={settingsModalHook.handleAboutPress}
        onClose={handleBottomSheetClose}
        onContactPress={settingsModalHook.handleContactPress}
        onSettingsPress={handleSettingsPress}
        visible={bottomSheetHook.isVisible}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  logoContainer: {
    marginVertical: SPACING.lg,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  contentArea: {
    flex: 1,
    marginTop: SPACING.md,
  },
  searchResults: {
    flex: 1,
  },
  recentSearchesContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: "transparent",
  },
});

export default HomeScreen;
