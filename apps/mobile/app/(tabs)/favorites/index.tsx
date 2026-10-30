import { useFavorites } from "@smog/favorites/client";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  cn,
  ErrorState,
  FavoritesEmptyState,
  GestureGrid,
  SearchResults,
} from "@smog/ui-native";
import { useRouter } from "expo-router";
import Search from "lucide-react-native/icons/search";
import { type ReactElement, useCallback } from "react";
import { useGestureCardRenderer } from "@/components/gesture-cards";
import {
  LIST_CONTENT,
  ListScreen,
  ListState,
  ListTop,
} from "@/components/screen";
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
  let content: ReactElement;
  if (loading && favorites.items.length === 0) {
    content = (
      <ListState>
        <SearchResults items={[]} onRetry={retry} state="loading" />
      </ListState>
    );
  } else if (
    (favorites.status === "error" || favorites.itemsStatus === "error") &&
    favorites.items.length === 0
  ) {
    content = (
      <ListState>
        <ErrorState onRetry={retry} />
      </ListState>
    );
  } else if (favorites.items.length === 0) {
    content = (
      <ListState>
        <FavoritesEmptyState
          action={
            <Button icon={<Search />} onPress={explore} variant="secondary">
              {t("common.exploreGestures")}
            </Button>
          }
        />
      </ListState>
    );
  } else {
    content = (
      <GestureGrid
        contentContainerClassName={cn("px-4", LIST_CONTENT)}
        contentInsetAdjustmentBehavior="automatic"
        items={favorites.items}
        // The grid's 12 px row gap follows the header: 4 + 12 is the 16 px.
        ListHeaderComponent={<ListTop className="pt-1" inset={false} />}
        onEndReached={loadMore}
        renderItem={renderCard}
      />
    );
  }

  return <ListScreen testID="favorites-screen">{content}</ListScreen>;
}
