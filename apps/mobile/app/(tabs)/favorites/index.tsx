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
import { type AppQueryUtils, useRetry } from "@/lib/retry";

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
  const renderCard = useGestureCardRenderer();
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
  let content: ReactElement;
  if (loading && favorites.items.length === 0) {
    content = <SearchResults items={[]} onRetry={retry} state="loading" />;
  } else if (
    (favorites.status === "error" || favorites.itemsStatus === "error") &&
    favorites.items.length === 0
  ) {
    content = <ErrorState onRetry={retry} />;
  } else if (favorites.items.length === 0) {
    content = (
      <FavoritesEmptyState
        action={
          <Button icon={<Search />} onPress={explore} variant="secondary">
            {t("common.exploreGestures")}
          </Button>
        }
      />
    );
  } else {
    content = (
      <GestureGrid
        contentContainerClassName="px-4 pb-6"
        contentInsetAdjustmentBehavior="automatic"
        items={favorites.items}
        onEndReached={loadMore}
        renderItem={renderCard}
      />
    );
  }

  return (
    <View className="flex-1 gap-2 bg-background pt-2" testID="favorites-screen">
      <ConnectionBanner />
      {content}
    </View>
  );
}
