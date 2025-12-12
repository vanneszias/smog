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
  const { favoriteIds } = useFavorites();
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

  // Show sign in message if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6">
        <Heart className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 font-bold text-2xl">Sign in to view favorites</h2>
        <p className="text-center text-muted-foreground">
          Sign in to save and view your favorite gestures
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <Heart className="h-6 w-6" style={{ color: "var(--liked)" }} />
          <h1 className="font-bold text-2xl" style={{ color: "var(--text)" }}>
            Favorites
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          {favoriteIds.length > 0
            ? `${favoriteIds.length} saved ${favoriteIds.length === 1 ? "gesture" : "gestures"}`
            : "No favorites yet"}
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          </div>
        ) : favoriteGestures.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
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
            gestures={favoriteGestures}
            isLoading={isLoading}
            onSelectGesture={handleSelectGesture}
            selectedGestureId={null}
          />
        )}
      </div>
    </div>
  );
}
