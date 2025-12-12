import type { GestureCardData } from "@smog/ui";
import { GestureList } from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/favorites")({
  component: FavoritesComponent,
});

function FavoritesComponent() {
  const navigate = useNavigate();
  const { isAuthenticated, convexUserId } = useAuth();
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
        <h2 className="mb-2 font-bold text-2xl">Sign in to view favorites</h2>
        <p className="text-center text-muted-foreground">
          Sign in to save and view your favorite gestures
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : favoriteGestures.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <Heart className="mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 font-bold text-xl">No favorites yet</h2>
            <p className="mb-4 text-muted-foreground">
              Start adding gestures to your favorites to see them here
            </p>
            <button
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate({ to: "/gestures" })}
              type="button"
            >
              Browse Gestures
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
