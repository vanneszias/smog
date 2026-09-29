import { SPACING } from "@smog/styles";
import { useRouter } from "expo-router";
import type React from "react";
import { useCallback, useRef, useState } from "react";
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
import { useLists } from "@/context/ListsContext";
import { useRecentSearches } from "@/context/RecentSearchesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useOptimizedSearch } from "@/hooks/useOptimizedSearch";
import type { Gesture } from "@/types";

const HomeScreen: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const { isGestureSaved, openListPicker } = useLists();
  const { t } = useTranslation();

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Hooks
  const searchHook = useOptimizedSearch({
    debounceMs: 300,
    displayPageSize: 50,
    enableCache: true,
    minSearchLength: 1,
  });

  const { addRecentSearch } = useRecentSearches();

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

  const handleOpenListPicker = useCallback(
    (gesture: Gesture) => {
      openListPicker({
        gestureId: gesture.id,
        gestureName: gesture.name,
        source: "search_results",
      });
    },
    [openListPicker]
  );

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
    },
    [searchHook, addRecentSearch]
  );

  const recentSearchesVisible = searchTerm.length === 0;

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
    searchHook.clearSearch();
  }, [searchHook.clearSearch]);

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
      isLoading={searchHook.isLoading}
      isRefreshing={searchHook.isSearching}
      isSaved={isGestureSaved}
      onGesturePress={handleGesturePress}
      onLoadMore={searchHook.loadMore}
      onOpenListPicker={handleOpenListPicker}
      onRefresh={searchHook.refresh}
      results={searchHook.results}
      style={styles.searchResults}
    />
  );

  const searchBarRef = useRef<TextInput>(null);

  const handleMenuAction = useCallback(
    (event: string): void => {
      if (event === "settings") {
        navigateToSettings();
      }
      if (event === "about") {
        handleAboutPress();
      }
      if (event === "contact") {
        handleContactPress();
      }
    },
    [navigateToSettings, handleAboutPress, handleContactPress]
  );

  const handleRecentSearchPress = useCallback(
    (query: string): void => {
      handleRecentSearchSelect(query);
      searchBarRef.current?.blur();
      Keyboard.dismiss();
    },
    [handleRecentSearchSelect]
  );

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
              image: Platform.select({
                android: "ic_menu_preferences",
                ios: "gearshape",
              }),
              title: t("settings.title"),
            },
            {
              id: "about",
              image: Platform.select({
                android: "ic_menu_info_details",
                ios: "info.circle",
              }),
              title: t("about.title"),
            },
            {
              id: "contact",
              image: Platform.select({
                android: "ic_menu_call",
                ios: "phone",
              }),
              title: t("contact.title"),
            },
          ]}
          onPressAction={handleMenuAction}
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
          onSelect={handleRecentSearchPress}
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
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  contentArea: {
    flex: 1,
    marginTop: SPACING.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  logoContainer: {
    marginVertical: SPACING.lg,
  },
  searchResults: {
    flex: 1,
  },
});

export default HomeScreen;
