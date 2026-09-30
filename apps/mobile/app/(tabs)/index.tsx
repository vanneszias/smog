import {
  useCategories,
  useGestures,
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
  Text,
} from "@smog/ui-native";
import { useRouter } from "expo-router";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import Settings from "lucide-react-native/icons/settings";
import { type ReactElement, useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionBanner } from "@/components/connection-banner";
import { useGestureCardRenderer } from "@/components/gesture-cards";

/** The featured row: the first gestures of the catalogue (as the site). */
const FEATURED_COUNT = 8;

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
 * Home: the logo and tagline, the search field (submitting opens the
 * search tab), the categories and a featured row, as the site's home.
 */
export default function HomeScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const recent = useRecentSearches();
  const categories = useCategories();
  const gestures = useGestures();
  const renderCard = useGestureCardRenderer();
  const featured = useMemo(
    () => (gestures.data ?? []).slice(0, FEATURED_COUNT),
    [gestures.data]
  );

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
      contentContainerStyle={{ paddingTop: insets.top }}
      keyboardShouldPersistTaps="handled"
      testID="home-screen"
    >
      <View className="flex-row items-center justify-between gap-3 px-4 pt-4">
        <Logo decorative size="md" />
        <IconButton
          icon={<Settings />}
          label={t("nav.settings")}
          onPress={openSettings}
          variant="ghost"
        />
      </View>
      <ConnectionBanner />
      <View className="gap-4 px-4">
        <Heading level={1}>{t("common.appName")}</Heading>
        <Text tone="muted">{t("home.tagline")}</Text>
        <SearchField
          onSubmitEditing={submit}
          onValueChange={setQuery}
          placeholder={t("search.placeholder")}
          value={query}
        />
      </View>
      {categories.data && categories.data.length > 0 ? (
        <View className="gap-2">
          <Heading className="px-4" level={2} size="title-3">
            {t("search.categories")}
          </Heading>
          <CategoryChips
            categories={categories.data}
            onChange={pickCategory}
            selected={[]}
            showAll={false}
          />
        </View>
      ) : null}
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
