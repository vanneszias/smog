import { useFavorites } from "@smog/favorites/client";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  ErrorState,
  FavoritesEmptyState,
  GestureGrid,
  SearchResults,
} from "@smog/ui-native";
import { useRouter } from "expo-router";
import Search from "lucide-react-native/icons/search";
import { type ReactElement, useCallback } from "react";
import { View } from "react-native";
import { ConnectionBanner } from "@/components/connection-banner";
import { useGestureCardRenderer } from "@/components/gesture-cards";
import { useOnline } from "@/lib/network";
import { type AppQueryUtils, useRetry } from "@/lib/retry";
import { SCREEN_CONTENT_CLASS_NAME, SCREEN_SCROLL_OPTIONS } from "@/lib/screen";

/** The account's favorites, or a guest's gestures by id. */
const favoriteQueries = (rpc: AppQueryUtils) => [
  rpc.favorites.key(),
  rpc.gestures.byIds.key(),
];

/**
 * Favorites: the hearted gestures, newest first, a page at a time. Guests
 * see the device's favorites, signed-in users their account's (the hook
 * picks; the screen does not branch).
 */
export default function FavoritesScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const favorites = useFavorites();
  const online = useOnline();
  const renderCard = useGestureCardRenderer("favorites");
  const explore = useCallback(() => router.navigate("/search"), [router]);
  const retry = useRetry(favoriteQueries);
  const { hasMoreItems, loadMoreItems } = favorites;
  const loadMore = useCallback(() => {
    if (hasMoreItems) {
      loadMoreItems().catch((error: unknown) => {
        console.error("[favorites] Failed to load more:", error);
      });
    }
  }, [hasMoreItems, loadMoreItems]);

  const loading =
    favorites.status === "loading" || favorites.itemsStatus === "loading";
  let empty: ReactElement | null = null;
  if (loading && favorites.items.length === 0) {
    empty = <SearchResults items={[]} onRetry={retry} state="loading" />;
  } else if (
    (favorites.status === "error" || favorites.itemsStatus === "error") &&
    favorites.items.length === 0
  ) {
    empty = <ErrorState onRetry={retry} />;
  } else if (favorites.items.length === 0) {
    empty = (
      <FavoritesEmptyState
        action={
          <Button icon={<Search />} onPress={explore} variant="secondary">
            {t("common.exploreGestures")}
          </Button>
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-background" testID="favorites-screen">
      <GestureGrid
        {...SCREEN_SCROLL_OPTIONS}
        contentContainerClassName={`${SCREEN_CONTENT_CLASS_NAME} px-4`}
        items={favorites.items}
        ListEmptyComponent={
          empty ? <View className="-mx-4">{empty}</View> : null
        }
        ListHeaderComponent={
          online ? null : <ConnectionBanner className="mx-0" />
        }
        onEndReached={loadMore}
        renderItem={renderCard}
        testID="favorites-scroll"
      />
    </View>
  );
}
