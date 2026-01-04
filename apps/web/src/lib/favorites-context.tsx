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
import { useAuth } from "./auth-context";

type FavoritesContextType = {
  favoriteIds: string[];
  isFavorite: (gestureId: string) => boolean;
  toggleFavorite: (gestureId: string, gestureName?: string) => Promise<void>;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextType | undefined>(
  undefined
);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { isAuthenticated, convexUserId, setConvexUserId } = useAuth();
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch or create Convex user when authenticated
  useEffect(() => {
    async function initializeUser() {
      if (isAuthenticated && !convexUserId && !isInitializing && !initError) {
        setIsInitializing(true);
        try {
          const user = await client.users.getOrCreateUser();
          if (user?._id) {
            setConvexUserId(user._id);
          }
        } catch (error) {
          console.error("Failed to initialize user:", error);
          // Prevent infinite retries on auth errors
          setInitError(true);
        } finally {
          setIsInitializing(false);
        }
      }
    }
    initializeUser();
  }, [
    isAuthenticated,
    convexUserId,
    setConvexUserId,
    isInitializing,
    initError,
  ]);

  // Reset error state when auth state changes (e.g., user signs out and back in)
  useEffect(() => {
    if (!isAuthenticated) {
      setInitError(false);
    }
  }, [isAuthenticated]);

  // Fetch favorites
  const fetchFavorites = useCallback(async () => {
    if (!convexUserId) {
      setFavoriteIds([]);
      return;
    }

    setIsLoading(true);
    try {
      const ids = await client.favorites.getUserFavorites({ convexUserId });
      setFavoriteIds(ids);
    } catch (error) {
      console.error("Failed to fetch favorites:", error);
      toast.error(t("web.favorites.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [convexUserId, t]);

  // Load favorites when convexUserId changes
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

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
        const result = await client.favorites.toggleFavorite({
          convexUserId,
          gestureId,
        });

        // Update local state immediately
        if (result) {
          setFavoriteIds((prev) => [...prev, gestureId]);
          toast.success(
            gestureName
              ? t("web.favorites.addedToFavorites", { name: gestureName })
              : t("web.favorites.addedToFavoritesShort")
          );
        } else {
          setFavoriteIds((prev) => prev.filter((id) => id !== gestureId));
          toast.success(
            gestureName
              ? t("web.favorites.removedFromFavorites", { name: gestureName })
              : t("web.favorites.removedFromFavoritesShort")
          );
        }
      } catch (error) {
        console.error("Failed to toggle favorite:", error);
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
