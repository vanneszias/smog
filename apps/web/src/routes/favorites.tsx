import type { GestureCardData } from "@smog/ui";
import { GestureList } from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useConvexUserId } from "@/lib/convex-user-sync";
import { useFavorites } from "@/lib/favorites-context";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/favorites")({
  component: FavoritesComponent,
});

function FavoritesComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const convexUserId = useConvexUserId();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [favoriteGestures, setFavoriteGestures] = useState<GestureCardData[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);

  // Fetch favorite gestures with full data
  useEffect(() => {
    async function loadFavorites() {
      if (!convexUserId) {
        setFavoriteGestures([]);
        return;
      }

      setIsLoading(true);
      try {
        const gestures = await client.favorites.getUserFavoriteGestures({
          convexUserId,
        });
        setFavoriteGestures(gestures);
      } catch (error) {
        console.error("Failed to load favorite gestures:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadFavorites();
  }, [convexUserId]);

  const handleSelectGesture = (gestureId: string) => {
    navigate({ to: "/gestures/$id", params: { id: gestureId } });
  };

  const handleToggleFavorite = (gestureId: string) => {
    const gesture = favoriteGestures.find((g) => g._id === gestureId);
    toggleFavorite(gestureId, gesture?.name);
  };

  // Show sign in message if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <Heart className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 font-bold text-2xl">
          {t("web.favorites.signInTitle")}
        </h2>
        <p className="text-center text-muted-foreground">
          {t("web.favorites.signInDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : favoriteGestures.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <Heart className="mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 font-bold text-xl">
              {t("web.favorites.noFavoritesTitle")}
            </h2>
            <p className="mb-4 text-muted-foreground">
              {t("web.favorites.noFavoritesDescription")}
            </p>
            <button
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate({ to: "/gestures" })}
              type="button"
            >
              {t("web.favorites.browseGestures")}
            </button>
          </div>
        ) : (
          <GestureList
            favoriteGestureIds={favoriteIds}
            gestures={favoriteGestures}
            isLoading={isLoading}
            onSelectGesture={handleSelectGesture}
            onToggleFavorite={handleToggleFavorite}
            selectedGestureId={null}
          />
        )}
      </div>
    </div>
  );
}
