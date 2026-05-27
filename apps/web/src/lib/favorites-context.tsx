import { createLogger } from "@smog/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { client } from "../utils/orpc";
import { useAuth } from "./auth";
import { useConvexUserId } from "./convex-user-sync";

const logger = createLogger("favoritesContext");

interface FavoritesContextType {
  favoriteIds: string[];
  isFavorite: (gestureId: string) => boolean;
  toggleFavorite: (gestureId: string, gestureName?: string) => Promise<void>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(
  undefined
);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const convexUserId = useConvexUserId();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch favorites
  const fetchFavorites = useCallback(async () => {
    if (!convexUserId) {
      setFavoriteIds([]);
      return;
    }

    setIsLoading(true);
    try {
      await client.lists.initialize();
      const ids = await client.favorites.getUserFavorites({ convexUserId });
      setFavoriteIds(ids);
    } catch (error) {
      logger.error("Failed to fetch favorites:", error);
      toast.error(t("web.favorites.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [convexUserId, t]);

  // Load favorites when convexUserId changes
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Clear favorites when user signs out
  useEffect(() => {
    if (!isAuthenticated) {
      setFavoriteIds([]);
    }
  }, [isAuthenticated]);

  const isFavorite = useCallback(
    (gestureId: string) => favoriteIds.includes(gestureId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    async (gestureId: string, gestureName?: string) => {
      if (!convexUserId) {
        toast.error(t("web.favorites.signInRequired"));
        return;
      }

      try {
        await client.lists.addGestureToLatest({
          gestureId,
        });

        setFavoriteIds((prev) =>
          prev.includes(gestureId) ? prev : [...prev, gestureId]
        );
        toast.success(
          gestureName
            ? t("web.lists.addedToList", { name: gestureName })
            : t("web.lists.addedToListShort", "Added to list")
        );
      } catch (error) {
        logger.error("Failed to add gesture to list:", error);
        toast.error(t("web.favorites.failedToUpdate"));
      }
    },
    [convexUserId, t]
  );

  const value = useMemo(
    () => ({
      favoriteIds,
      isFavorite,
      toggleFavorite,
      isLoading,
      refetch: fetchFavorites,
    }),
    [favoriteIds, isFavorite, toggleFavorite, isLoading, fetchFavorites]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return context;
}
