import {
  useCategories,
  useFeaturedGestures,
  useRecentGestures,
  useRecentSearches,
} from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  CategoryChips,
  ErrorState,
  GestureGrid,
  Heading,
  IconButton,
  Logo,
  SearchField,
  Skeleton,
  Surface,
  Text,
} from "@smog/ui-native";
import { useIsFocused, useRouter } from "expo-router";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import Settings from "lucide-react-native/icons/settings";
import { type ReactElement, useCallback, useState } from "react";
import { ScrollView, StatusBar, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionBanner } from "@/components/connection-banner";
import { useGestureCardRenderer } from "@/components/gesture-cards";

function FeaturedSkeleton(): ReactElement {
  return (
    <View className="flex-row flex-wrap gap-3 px-4">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton
          className="h-auto w-5/12 grow rounded-lg"
          // biome-ignore lint/suspicious/noArrayIndexKey: identical, static placeholders
          key={index}
          style={CARD_STYLE}
        />
      ))}
    </View>
  );
}

const CARD_STYLE = { aspectRatio: 3 / 4 } as const;

/**
 * "Continue where you left off": the gestures this device opened lately
 * (the local store), as the site's home. Nothing while there is nothing to
 * continue, and no error state when the read fails (a convenience).
 */
function RecentGestures(): ReactElement | null {
  const { t } = useTranslation();
  const recent = useRecentGestures();
  const renderCard = useGestureCardRenderer();
  const { clear } = recent;
  const clearAll = useCallback(() => {
    clear().catch((error: unknown) => {
      console.error("[home] Failed to clear the recent gestures:", error);
    });
  }, [clear]);
  if (recent.status === "empty" || recent.status === "error") {
    return null;
  }
  if (recent.status === "ready" && recent.gestures.length === 0) {
    return null;
  }
  return (
    <View className="gap-3" testID="home-recent">
      <View className="flex-row items-center justify-between gap-2 px-4">
        <Heading level={2}>{t("landing.continue")}</Heading>
        <Button
          accessibilityLabel={t("landing.clearRecent")}
          onPress={clearAll}
          variant="ghost"
        >
          {t("landing.clear")}
        </Button>
      </View>
      {recent.status === "ready" ? (
        <GestureGrid
          contentContainerClassName="px-4"
          items={recent.gestures}
          renderItem={renderCard}
          scrollEnabled={false}
        />
      ) : (
        <FeaturedSkeleton />
      )}
    </View>
  );
}

/**
 * Home: a green hero (the reversed logo, the headline and the search
 * field; submitting opens the search tab), the categories, "continue where
 * you left off" and a featured row, as the site's home.
 */
export default function HomeScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [query, setQuery] = useState("");
  const recent = useRecentSearches();
  const categories = useCategories();
  // The featured row: the first gestures of the catalogue, as the site.
  const gestures = useFeaturedGestures();
  const renderCard = useGestureCardRenderer();
  const featured = gestures.data ?? [];

  const openSettings = useCallback(() => router.push("/settings"), [router]);
  const openSearch = useCallback(
    (params: { category?: string; q?: string } = {}) =>
      router.navigate({ params, pathname: "/search" }),
    [router]
  );
  const submit = useCallback(() => {
    const q = query.trim();
    if (!q) {
      return;
    }
    // search_performed (source submit) is sent by the search tab (`?q=`).
    recent.add(q).catch((error: unknown) => {
      console.error("[home] Failed to save a recent search:", error);
    });
    openSearch({ q });
    setQuery("");
  }, [openSearch, query, recent]);
  const pickCategory = useCallback(
    (selected: string[]) => {
      const [first] = selected;
      if (first) {
        openSearch({ category: first });
      }
    },
    [openSearch]
  );
  const browseAll = useCallback(() => openSearch(), [openSearch]);
  const { refetch } = gestures;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[home] Failed to reload the gestures:", error);
    });
  }, [refetch]);

  let featuredContent: ReactElement;
  if (gestures.isPending) {
    featuredContent = <FeaturedSkeleton />;
  } else if (gestures.isError && featured.length === 0) {
    featuredContent = (
      <ErrorState onRetry={retry} retrying={gestures.isRefetching} />
    );
  } else {
    featuredContent = (
      <GestureGrid
        contentContainerClassName="px-4"
        items={featured}
        renderItem={renderCard}
        scrollEnabled={false}
      />
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 pb-10"
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      testID="home-screen"
    >
      {focused ? <StatusBar barStyle="light-content" /> : null}
      <Surface
        className="gap-4 rounded-b-3xl px-4 pb-8"
        style={{ paddingTop: insets.top + 16 }}
        tone="primary"
      >
        <View className="flex-row items-center justify-between gap-3">
          <Logo color="primaryForeground" decorative size="md" tone="current" />
          <IconButton
            icon={<Settings />}
            label={t("nav.settings")}
            onPress={openSettings}
            variant="ghost"
          />
        </View>
        <Heading level={1} size="title-1">
          {t("home.title")}
        </Heading>
        <Text tone="muted">{t("home.tagline")}</Text>
        <SearchField
          onSubmitEditing={submit}
          onValueChange={setQuery}
          placeholder={t("search.placeholder")}
          value={query}
        />
      </Surface>
      <ConnectionBanner />
      {categories.data && categories.data.length > 0 ? (
        <View className="gap-2">
          <Heading className="px-4" level={2} size="title-3">
            {t("landing.categoriesIntro")}
          </Heading>
          <CategoryChips
            categories={categories.data}
            onChange={pickCategory}
            selected={[]}
            showAll={false}
          />
        </View>
      ) : null}
      <RecentGestures />
      <View className="gap-3">
        <Heading className="px-4" level={2}>
          {t("home.featured")}
        </Heading>
        {featuredContent}
        <Button
          className="mx-4 self-start"
          icon={<ArrowRight />}
          onPress={browseAll}
          variant="secondary"
        >
          {t("home.browseAll")}
        </Button>
      </View>
    </ScrollView>
  );
}
