import { SPACING } from "@smog/styles";
import { useRouter } from "expo-router";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  type TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeaderMenuButton } from "@/components/common";
import Logo from "@/components/Logo";
import RecentSearches from "@/components/search/RecentSearches";
import SearchBar from "@/components/search/SearchBar";
import SearchResults from "@/components/search/SearchResults";
import { useFavorites } from "@/context/FavoritesContext";
import { useRecentSearches } from "@/context/RecentSearchesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useOptimizedSearch } from "@/hooks/useOptimizedSearch";
import {
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

  const handleRecentSearchSelect = useCallback(
    (query: string) => {
      setSearchTerm(query);
      searchHook.search(query);
      addRecentSearch(query);

      const position = recentSearches.indexOf(query);
      trackRecentSearchSelected(query, position >= 0 ? position : 0);
    },
    [searchHook, addRecentSearch, recentSearches]
  );

  const recentSearchesVisible = searchTerm.length === 0;

  const handleClearSearch = useCallback(() => {
    const previousQuery = searchTerm;
    setSearchTerm("");
    searchHook.clearSearch();
    trackSearchCleared(previousQuery);
  }, [searchHook.clearSearch, searchTerm]);

  const handleSearchFocus = useCallback(() => {
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    setIsSearchFocused(false);
  }, []);

  const handleSearchCancel = useCallback(() => {
    setIsSearchFocused(false);
  }, []);

  // Menu handlers
  const handleAboutPress = useCallback(() => {
    Linking.openURL("https://smog.vlaanderen");
  }, []);

  const handleContactPress = useCallback(() => {
    Linking.openURL("mailto:hello@smog.vlaanderen");
  }, []);

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

  const searchBarRef = useRef<TextInput>(null);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header with native context menu */}
      <View style={styles.header}>
        <HeaderMenuButton
          actions={[
            {
              id: "settings",
              title: t("settings.title"),
              image: Platform.select({
                ios: "gearshape",
                android: "ic_menu_preferences",
              }),
            },
            {
              id: "about",
              title: t("about.title"),
              image: Platform.select({
                ios: "info.circle",
                android: "ic_menu_info_details",
              }),
            },
            {
              id: "contact",
              title: t("contact.title"),
              image: Platform.select({
                ios: "phone",
                android: "ic_menu_call",
              }),
            },
          ]}
          onPressAction={(event) => {
            if (event === "settings") {
              navigateToSettings();
            }
            if (event === "about") {
              handleAboutPress();
            }
            if (event === "contact") {
              handleContactPress();
            }
          }}
        />
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
            searchBarRef.current?.blur();
            Keyboard.dismiss();
          }}
          searchTerm={searchTerm}
          visible={recentSearchesVisible}
        />

        {/* Content area */}
        <View style={styles.contentArea}>
          {searchTerm.length > 0 && renderSearchResults()}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
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
});

export default HomeScreen;
