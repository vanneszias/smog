import { useFavorites } from "@smog/favorites/client";
import { useTranslation } from "@smog/i18n/react";
import { Button, ErrorState, FavoritesEmptyState } from "@smog/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import {
  GestureGridSkeleton,
  LinkedGestureGrid,
} from "@/components/learning/gesture-cards";
import { useHearts } from "@/components/learning/use-hearts";

/**
 * Favorites (spec §16 flow 2): the device's for guests, the account's
 * when signed in (`useFavorites` picks; the screen does not).
 */
export function FavoritesPanel(): ReactNode {
  const { t } = useTranslation();
  const favorites = useFavorites();
  const hearts = useHearts();
  const queryClient = useQueryClient();
  const retry = useCallback(() => {
    queryClient
      .invalidateQueries({ type: "active" })
      .catch((error: unknown) => {
        console.error("[favorites] Failed to reload the favorites:", error);
      });
  }, [queryClient]);
  const { loadMoreItems } = favorites;
  const loadMore = useCallback(() => {
    loadMoreItems().catch((error: unknown) => {
      console.error("[favorites] Failed to load more:", error);
    });
  }, [loadMoreItems]);
  let body: ReactNode;
  if (favorites.itemsStatus === "loading" || favorites.status === "loading") {
    body = <GestureGridSkeleton />;
  } else if (favorites.itemsStatus === "error") {
    body = <ErrorState onRetry={retry} />;
  } else if (favorites.items.length === 0) {
    body = (
      <FavoritesEmptyState
        action={
          <Button asChild>
            <Link to="/gestures">{t("search.browse")}</Link>
          </Button>
        }
        level={2}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <LinkedGestureGrid
          from="favorites"
          hearts={hearts}
          items={favorites.items}
          level={2}
        />
        {favorites.hasMoreItems ? (
          <Button
            className="self-center"
            onClick={loadMore}
            variant="secondary"
          >
            {t("kit.loadMore")}
          </Button>
        ) : null}
      </div>
    );
  }
  return body;
}
