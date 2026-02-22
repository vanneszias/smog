import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useConvexUserId } from "@/context/ConvexUserSync";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/context/TranslationContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import gestureService from "@/services/gestureService";
import offlineFavoritesService, {
  type SyncOperation,
} from "@/services/offlineFavoritesService";
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
  const { isOffline } = useNetworkStatus();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteGestures, setFavoriteGestures] = useState<Gesture[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingOperations, setPendingOperations] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // Convex queries and mutations - primary data source
  const convexFavoriteIds = useQuery(
    api.favorites.getUserFavorites,
    userId ? { userId } : "skip"
  );
  const toggleUserFavorite = useMutation(api.favorites.toggleUserFavorite);

  // Initialize offline favorites service
  useEffect(() => {
    const initializeService = async () => {
      try {
        await offlineFavoritesService.initialize();

        // Set up sync callback
        offlineFavoritesService.onSyncOperation = async (op: SyncOperation) => {
          await toggleUserFavorite({
            userId: op.user_id as Id<"users">,
            gestureId: op.gesture_id as Id<"gestures">,
          });
        };

        setIsInitialized(true);
      } catch (error) {
        logger.error("Failed to initialize offline favorites service:", error);
      }
    };

    initializeService();
  }, [toggleUserFavorite]);

  // Migrate legacy AsyncStorage favorites when user becomes available
  useEffect(() => {
    if (!(userId && isInitialized)) {
      return;
    }

    const migrateLegacyFavorites = async () => {
      try {
        const legacyFavorites = await AsyncStorage.getItem("favorites");
        if (legacyFavorites) {
          const parsedFavorites = JSON.parse(legacyFavorites) as string[];
          if (parsedFavorites.length > 0) {
            await offlineFavoritesService.migrateLegacyFavorites(
              userId,
              parsedFavorites
            );
            await AsyncStorage.removeItem("favorites");

            logger.log(
              `[FavoritesProvider] Migrated ${parsedFavorites.length} legacy favorites`
            );
          }
        }
      } catch (error) {
        logger.error("Failed to migrate legacy favorites:", error);
      }
    };

    migrateLegacyFavorites();
  }, [userId, isInitialized]);

  // Sync local cache from Convex (Convex is source of truth)
  const loadFavoritesFromConvex = useCallback(
    async (convexIds: string[], userId: string) => {
      // Update local cache with Convex data for offline access (one-way sync)
      await offlineFavoritesService.syncFromConvex(userId, convexIds);

      logger.log(
        `[FavoritesProvider] Loaded ${convexIds.length} favorites from Convex and synced to local cache`
      );

      return convexIds;
    },
    []
  );

  const loadFavoritesFromLocal = useCallback(async (userId: string) => {
    const favoriteIds = await offlineFavoritesService.getFavorites(userId);

    logger.log(
      `[FavoritesProvider] Loaded ${favoriteIds.length} favorites from local database (offline mode)`
    );

    return favoriteIds;
  }, []);

  const loadGestureDetails = useCallback(async (favoriteIds: string[]) => {
    if (favoriteIds.length > 0) {
      const gestures = await gestureService.getGesturesByIds(favoriteIds);
      setFavoriteGestures(gestures);
    } else {
      setFavoriteGestures([]);
    }
  }, []);

  // Load favorites from Convex (primary) or local database (fallback when offline)
  const loadFavorites = useCallback(async () => {
    if (!(userId && isInitialized)) {
      return;
    }

    try {
      setIsLoading(true);

      let favoriteIds: string[] = [];

      // Primary: Use Convex data when online
      const canUseConvex = !isOffline && convexFavoriteIds !== undefined;
      if (canUseConvex) {
        favoriteIds = await loadFavoritesFromConvex(
          convexFavoriteIds as string[],
          userId
        );
      } else {
        // Fallback: Use local database when offline
        favoriteIds = await loadFavoritesFromLocal(userId);
      }

      setFavorites(favoriteIds);
      await loadGestureDetails(favoriteIds);

      // Update pending operations count
      const pending = await offlineFavoritesService.getPendingOperationsCount();
      setPendingOperations(pending);
    } catch (error) {
      logger.error("Failed to load favorites:", error);
    } finally {
      setIsLoading(false);
    }
  }, [
    userId,
    isInitialized,
    isOffline,
    convexFavoriteIds,
    loadFavoritesFromConvex,
    loadFavoritesFromLocal,
    loadGestureDetails,
  ]);

  // Load favorites when data becomes available
  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Sync pending operations when coming back online
  useEffect(() => {
    const shouldSync = !isOffline && isInitialized && userId;
    if (shouldSync) {
      offlineFavoritesService.syncPendingOperations().catch((error) => {
        logger.warn(
          "[FavoritesProvider] Failed to sync pending operations:",
          error
        );
      });
    }
  }, [isOffline, isInitialized, userId]);

  const toggleFavoriteOnline = useCallback(
    async (userId: string, gestureId: string) => {
      // Use Convex as source of truth
      const wasAdded = await toggleUserFavorite({
        userId: userId as Id<"users">,
        gestureId: gestureId as Id<"gestures">,
      });

      // Update local cache to match Convex
      await offlineFavoritesService.updateLocalCache(
        userId,
        gestureId,
        wasAdded
      );

      logger.log(
        `[FavoritesProvider] Favorite ${wasAdded ? "added" : "removed"} via Convex: ${gestureId}`
      );

      return wasAdded;
    },
    [toggleUserFavorite]
  );

  const toggleFavoriteOffline = useCallback(
    async (userId: string, gestureId: string) => {
      const wasAdded = await offlineFavoritesService.toggleFavoriteOffline(
        userId,
        gestureId
      );

      logger.log(
        `[FavoritesProvider] Favorite ${wasAdded ? "added" : "removed"} offline (queued for sync): ${gestureId}`
      );

      return wasAdded;
    },
    []
  );

  const updateLocalState = useCallback(
    async (gestureId: string, wasAdded: boolean) => {
      if (wasAdded) {
        setFavorites((current) => [...current, gestureId]);
        const gesture = await gestureService.getGestureById(gestureId);
        if (gesture) {
          setFavoriteGestures((current) => [...current, gesture]);
        }
      } else {
        setFavorites((current) => current.filter((id) => id !== gestureId));
        setFavoriteGestures((current) =>
          current.filter((gesture) => gesture.id !== gestureId)
        );
      }
    },
    []
  );

  const toggleFavorite = async (gestureId: string, _gestureName?: string) => {
    if (!(userId && isInitialized)) {
      logger.warn("Cannot toggle favorite: user or service not available");
      return;
    }

    try {
      let wasAdded = false;

      // Primary: Try Convex mutation first when online
      if (isOffline) {
        wasAdded = await toggleFavoriteOffline(userId, gestureId);
      } else {
        try {
          wasAdded = await toggleFavoriteOnline(userId, gestureId);
        } catch (error) {
          logger.error(
            "[FavoritesProvider] Convex mutation failed, falling back to offline mode:",
            error
          );
          wasAdded = await toggleFavoriteOffline(userId, gestureId);
        }
      }

      // Update local state immediately for instant UI feedback
      await updateLocalState(gestureId, wasAdded);

      // Show toast notification
      showToast({
        message: wasAdded
          ? t("gesture.addedToFavoritesShort")
          : t("gesture.removedFromFavoritesShort"),
        type: wasAdded ? "success" : "info",
        duration: 2000,
      });

      // Update pending operations count
      const pending = await offlineFavoritesService.getPendingOperationsCount();
      setPendingOperations(pending);
    } catch (error) {
      logger.error("Failed to toggle favorite:", error);
      showToast({
        message: t("favorites.error"),
        type: "error",
        duration: 2000,
      });
    }
  };

  const isFavorite = (gestureId: string) => favorites.includes(gestureId);

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        favoriteGestures,
        toggleFavorite,
        isFavorite,
        isLoading,
        pendingOperations,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export default FavoritesProvider;
