import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation } from "convex/react";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import gestureService from "@/services/gestureService";
import offlineFavoritesService, {
  type SyncOperation,
} from "@/services/offlineFavoritesService";
import type { Gesture } from "@/types";

export type FavoritesContextType = {
  favorites: string[];
  favoriteGestures: Gesture[];
  toggleFavorite: (gestureId: string, _gestureName?: string) => void;
  isFavorite: (gestureId: string) => boolean;
  isLoading: boolean;
  pendingOperations: number;
};

const FavoritesContext = createContext<FavoritesContextType>({
  favorites: [],
  favoriteGestures: [],
  toggleFavorite: () => {},
  isFavorite: () => false,
  isLoading: false,
  pendingOperations: 0,
});

export const useFavorites = () => useContext(FavoritesContext);

type FavoritesProviderProps = {
  children: React.ReactNode;
};

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({
  children,
}) => {
  const { userId } = useAuth();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteGestures, setFavoriteGestures] = useState<Gesture[]>([]);
  const [isLoading, _setIsLoading] = useState(false);
  const [pendingOperations, setPendingOperations] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // Convex mutations for sync
  const toggleUserFavorite = useMutation(api.favorites.toggleUserFavorite);

  // Initialize offline favorites service
  useEffect(() => {
    const initializeService = async () => {
      try {
        await offlineFavoritesService.initialize();

        // Set up sync callback
        offlineFavoritesService.onSyncOperation = async (op: SyncOperation) => {
          if (op.operation === "add") {
            await toggleUserFavorite({
              userId: op.user_id as Id<"users">,
              gestureId: op.gesture_id as Id<"gestures">,
            });
          } else {
            // For remove operations, we need the remove mutation
            await toggleUserFavorite({
              userId: op.user_id as Id<"users">,
              gestureId: op.gesture_id as Id<"gestures">,
            });
          }
        };

        setIsInitialized(true);
      } catch (error) {
        console.error("Failed to initialize offline favorites service:", error);
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

            if (__DEV__) {
              console.log(
                `[FavoritesProvider] Migrated ${parsedFavorites.length} legacy favorites`
              );
            }
          }
        }
      } catch (error) {
        console.error("Failed to migrate legacy favorites:", error);
      }
    };

    migrateLegacyFavorites();
  }, [userId, isInitialized]);

  // Load favorites from local database
  const loadFavorites = useCallback(async () => {
    if (!(userId && isInitialized)) {
      return;
    }

    try {
      const favoriteIds = await offlineFavoritesService.getFavorites(userId);
      setFavorites(favoriteIds);

      // Load gesture details
      if (favoriteIds.length > 0) {
        const gestures = await gestureService.getGesturesByIds(favoriteIds);
        setFavoriteGestures(gestures);
      } else {
        setFavoriteGestures([]);
      }

      // Update pending operations count
      const pending = await offlineFavoritesService.getPendingOperationsCount();
      setPendingOperations(pending);
    } catch (error) {
      console.error("Failed to load favorites:", error);
    }
  }, [userId, isInitialized]);

  // Load favorites when user or service becomes available
  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Refresh favorites periodically to catch sync updates
  useEffect(() => {
    if (!(userId && isInitialized)) {
      return;
    }

    const interval = setInterval(() => {
      loadFavorites();
    }, 10_000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [userId, isInitialized, loadFavorites]);

  const toggleFavorite = async (gestureId: string, _gestureName?: string) => {
    if (!(userId && isInitialized)) {
      console.warn("Cannot toggle favorite: user or service not available");
      return;
    }

    try {
      const wasAdded = await offlineFavoritesService.toggleFavorite(
        userId,
        gestureId
      );

      // Update local state immediately for instant UI feedback
      if (wasAdded) {
        setFavorites((current) => [...current, gestureId]);
        // Add gesture to favorite gestures if we can find it
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

      // Update pending operations count
      const pending = await offlineFavoritesService.getPendingOperationsCount();
      setPendingOperations(pending);

      if (__DEV__) {
        console.log(
          `[FavoritesProvider] Favorite ${wasAdded ? "added" : "removed"} offline: ${gestureId}`
        );
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
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
