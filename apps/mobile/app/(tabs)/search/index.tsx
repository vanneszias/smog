import {
  useCategories,
  useGestureSearch,
  useRecentSearches,
} from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Heading,
  ListItem,
  SearchField,
  SearchResults,
  type SearchResultsState,
} from "@smog/ui-native";
import { Stack, useLocalSearchParams } from "expo-router";
import Clock from "lucide-react-native/icons/clock";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, ScrollView, View } from "react-native";
import type { SearchBarCommands } from "react-native-screens";
import { CategoryFilterSheet } from "@/components/category-filter-sheet";
import { ConnectionBanner } from "@/components/connection-banner";
import { useGestureCardRenderer } from "@/components/gesture-cards";

/** Results per search (the contract's maximum). */
const SEARCH_LIMIT = 50;

/** `?category=a,b` as slugs. */
function parseCategories(value: string | string[] | undefined): string[] {
  const joined = Array.isArray(value) ? value.join(",") : (value ?? "");
  return joined
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

function RecentSearch({
  onPick,
  query,
}: {
  onPick: (query: string) => void;
  query: string;
}): ReactElement {
  const pick = useCallback(() => onPick(query), [onPick, query]);
  return <ListItem leading={<Clock />} onPress={pick} title={query} />;
}

function RecentSearchList({
  items,
  onClear,
  onPick,
}: {
  items: readonly string[];
  onClear: () => void;
  onPick: (query: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <ScrollView
      contentContainerClassName="gap-2 px-4 pb-6"
      keyboardShouldPersistTaps="handled"
    >
      <Heading level={2} size="title-3">
        {t("search.recent")}
      </Heading>
      <View>
        {items.map((item) => (
          <RecentSearch key={item} onPick={onPick} query={item} />
        ))}
      </View>
      <Button className="self-start" onPress={onClear} variant="ghost">
        {t("search.clearRecent")}
      </Button>
    </ScrollView>
  );
}

/**
 * Search: results update as you type (debounced by the hook), filtered by
 * categories chosen in a sheet; recent searches while the field is focused
 * and empty. iOS uses the native header search bar, Android the kit's
 * SearchField. `?q=` and `?category=` (deep links, the gesture screen's
 * category chips) set the query and the filter.
 */
export default function SearchScreen(): ReactElement {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const [query, setQuery] = useState(params.q ?? "");
  const [category, setCategory] = useState(() =>
    parseCategories(params.category)
  );
  const [focused, setFocused] = useState(false);
  const searchBar = useRef<SearchBarCommands>(null);
  const recent = useRecentSearches();
  const categories = useCategories();
  const renderCard = useGestureCardRenderer();

  // The tab stays mounted: a new link or category chip replaces the search.
  useEffect(() => {
    if (params.q !== undefined) {
      setQuery(params.q);
      searchBar.current?.setText(params.q);
    }
  }, [params.q]);
  useEffect(() => {
    if (params.category !== undefined) {
      setCategory(parseCategories(params.category));
    }
  }, [params.category]);

  const search = useGestureSearch({ category, limit: SEARCH_LIMIT, q: query });
  const items = search.data?.items ?? [];

  const submit = useCallback(() => {
    const q = query.trim();
    if (q) {
      // analytics: search_performed { source: "submit" }
      recent.add(q).catch((error: unknown) => {
        console.error("[search] Failed to save a recent search:", error);
      });
    }
  }, [query, recent]);
  const pickRecent = useCallback((q: string) => {
    // analytics: search_performed { source: "recent_search" }
    setQuery(q);
    searchBar.current?.setText(q);
  }, []);
  const clearRecent = useCallback(() => {
    recent.clear().catch((error: unknown) => {
      console.error("[search] Failed to clear recent searches:", error);
    });
  }, [recent]);
  const clearCategories = useCallback(() => setCategory([]), []);
  const focus = useCallback(() => setFocused(true), []);
  const blur = useCallback(() => setFocused(false), []);
  const cancel = useCallback(() => setQuery(""), []);
  const { refetch } = search;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[search] Failed to search again:", error);
    });
  }, [refetch]);

  const filter = useMemo(
    () => (
      <CategoryFilterSheet
        categories={categories.data ?? []}
        onChange={setCategory}
        selected={category}
      />
    ),
    [categories.data, category]
  );
  const headerRight = useCallback(() => filter, [filter]);

  let state: SearchResultsState = "results";
  if (search.isPending) {
    state = "loading";
  } else if (search.isError && items.length === 0) {
    state = "error";
  } else if (items.length === 0) {
    state = "empty";
  }
  const showRecent = focused && query.trim() === "" && recent.items.length > 0;
  const ios = Platform.OS === "ios";

  return (
    <View className="flex-1 bg-background" testID="search-screen">
      <Stack.Screen
        options={
          ios
            ? {
                headerRight,
                headerSearchBarOptions: {
                  autoCapitalize: "none",
                  hideWhenScrolling: false,
                  onBlur: blur,
                  onCancelButtonPress: cancel,
                  onChangeText: (event) => setQuery(event.nativeEvent.text),
                  onFocus: focus,
                  onSearchButtonPress: submit,
                  placeholder: t("search.placeholder"),
                  ref: searchBar,
                },
              }
            : {}
        }
      />
      <ConnectionBanner className="mt-2" />
      {ios ? null : (
        <View className="flex-row items-center gap-2 px-4 py-2">
          <View className="flex-1">
            <SearchField
              onBlur={blur}
              onFocus={focus}
              onSubmitEditing={submit}
              onValueChange={setQuery}
              placeholder={t("search.placeholder")}
              value={query}
            />
          </View>
          {filter}
        </View>
      )}
      {showRecent ? (
        <RecentSearchList
          items={recent.items}
          onClear={clearRecent}
          onPick={pickRecent}
        />
      ) : (
        <SearchResults
          className="flex-1 pt-2"
          emptyAction={
            category.length > 0 ? (
              <Button onPress={clearCategories} variant="secondary">
                {t("search.clearFilter")}
              </Button>
            ) : undefined
          }
          items={items}
          onRetry={retry}
          renderItem={renderCard}
          retrying={search.isRefetching}
          state={state}
        />
      )}
    </View>
  );
}
