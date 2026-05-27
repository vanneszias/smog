import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useConvexUserId } from "@/context/ConvexUserSync";
import type { Gesture } from "@/types";
import logger from "@/utils/logger";

export interface FavoritesContextType {
  favorites: string[];
  favoriteGestures: Gesture[];
  toggleFavorite: (gestureId: string, _gestureName?: string) => void;
  isFavorite: (gestureId: string) => boolean;
  isLoading: boolean;
  pendingOperations: number;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favorites: [],
  favoriteGestures: [],
  toggleFavorite: () => {
    /* noop */
  },
  isFavorite: () => false,
  isLoading: false,
  pendingOperations: 0,
});

export const useFavorites = () => useContext(FavoritesContext);

interface FavoritesProviderProps {
  children: React.ReactNode;
}

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({
  children,
}) => {
  const userId = useConvexUserId();
  const convexFavoriteIds = useQuery(
    api.favorites.getUserFavorites,
    userId ? { userId } : "skip"
  );
  const convexFavoriteGestures = useQuery(
    api.favorites.getUserFavoriteGesturesForNative,
    userId ? { userId } : "skip"
  ) as Gesture[] | undefined;
  const toggleUserFavorite = useMutation(api.favorites.toggleUserFavorite);
  const [optimisticFavorites, setOptimisticFavorites] = useState<
    string[] | null
  >(null);

  useEffect(() => {
    if (convexFavoriteIds !== undefined) {
      setOptimisticFavorites(null);
    }
  }, [convexFavoriteIds]);

  const serverFavorites = useMemo(
    () => convexFavoriteIds?.map((id) => id as string) ?? [],
    [convexFavoriteIds]
  );
  const favorites = optimisticFavorites ?? serverFavorites;

  const favoriteGestures = useMemo(() => {
    const gestureMap = new Map(
      (convexFavoriteGestures ?? []).map((gesture) => [gesture.id, gesture])
    );
    return favorites
      .map((gestureId) => gestureMap.get(gestureId))
      .filter((gesture): gesture is Gesture => Boolean(gesture));
  }, [convexFavoriteGestures, favorites]);

  const isFavorite = useCallback(
    (gestureId: string) => favorites.includes(gestureId),
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (gestureId: string, _gestureName?: string) => {
      if (!userId) {
        logger.warn("Cannot toggle favorite: user not available");
        return;
      }

      const previousFavorites = favorites;
      const nextFavorites = previousFavorites.includes(gestureId)
        ? previousFavorites.filter((id) => id !== gestureId)
        : [...previousFavorites, gestureId];

      setOptimisticFavorites(nextFavorites);

      try {
        await toggleUserFavorite({
          userId,
          gestureId: gestureId as Id<"gestures">,
        });
      } catch (error) {
        setOptimisticFavorites(previousFavorites);
        logger.error("Failed to toggle favorite:", error);
      }
    },
    [favorites, toggleUserFavorite, userId]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        favoriteGestures,
        toggleFavorite,
        isFavorite,
        isLoading:
          Boolean(userId) &&
          (convexFavoriteIds === undefined ||
            convexFavoriteGestures === undefined),
        pendingOperations: 0,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export default FavoritesProvider;
