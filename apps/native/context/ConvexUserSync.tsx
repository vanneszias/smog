/**
 * Convex User Sync for Native
 *
 * Creates and synchronizes users in the Convex database based on auth state.
 * Handles both authenticated users (WorkOS) and guest users.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import logger from "@/utils/logger";
import { useAuth } from "./AuthProvider";

const GUEST_ID_KEY = "@smog_guest_id";

interface ConvexUserContextType {
  userId: Id<"users"> | null;
  isLoading: boolean;
}

const ConvexUserContext = createContext<ConvexUserContextType>({
  userId: null,
  isLoading: true,
});

/**
 * Provider that syncs users to Convex database
 * Must be rendered inside ConvexProviderWithAuth and AuthProvider
 */
export function ConvexUserSync({ children }: { children: ReactNode }) {
  const { authMode, user, guestId, isLoading: isAuthLoading } = useAuth();
  const convexAuth = useConvexAuth();
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Convex mutations
  const createUser = useMutation(api.users.createUser);
  const migrateGuestToUser = useMutation(api.users.migrateGuestToUser);

  // Convex queries
  const workosId = user?.id;
  const isConvexAuthReady =
    authMode !== "authenticated" || convexAuth.isAuthenticated;
  const shouldQueryWorkOSUser = Boolean(
    workosId && authMode === "authenticated" && convexAuth.isAuthenticated
  );
  const existingUserByWorkOS = useQuery(
    api.users.getUserByWorkOSId,
    shouldQueryWorkOSUser && workosId ? { workosId } : "skip"
  );
  const existingUserByGuest = useQuery(
    api.users.getUserByGuestId,
    guestId ? { guestId } : "skip"
  );

  // Sync authenticated user
  const syncAuthenticatedUser = useCallback(async () => {
    if (!(workosId && convexAuth.isAuthenticated)) {
      return;
    }

    // User exists in Convex
    if (existingUserByWorkOS) {
      setUserId(existingUserByWorkOS._id);
      return;
    }

    // Need to create user
    if (existingUserByWorkOS === null) {
      setIsInitializing(true);
      try {
        const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
        const newUserId = storedGuestId
          ? await migrateGuestToUser({ guestId: storedGuestId, workosId })
          : await createUser({ workosId });
        setUserId(newUserId);
      } catch (error) {
        logger.error("[ConvexUserSync] Failed to sync user:", error);
      } finally {
        setIsInitializing(false);
      }
    }
  }, [
    workosId,
    convexAuth.isAuthenticated,
    existingUserByWorkOS,
    createUser,
    migrateGuestToUser,
  ]);

  // Sync guest user
  const syncGuestUser = useCallback(async () => {
    if (!guestId) {
      return;
    }

    // Guest exists in Convex
    if (existingUserByGuest) {
      setUserId(existingUserByGuest._id);
      return;
    }

    // Need to create guest
    if (existingUserByGuest === null) {
      setIsInitializing(true);
      try {
        const newUserId = await createUser({ guestId });
        setUserId(newUserId);
      } catch (error) {
        logger.error("[ConvexUserSync] Failed to create guest:", error);
      } finally {
        setIsInitializing(false);
      }
    }
  }, [guestId, existingUserByGuest, createUser]);

  // Handle auth state changes
  useEffect(() => {
    if (isAuthLoading || isInitializing || !isConvexAuthReady) {
      return;
    }

    if (authMode === "authenticated") {
      syncAuthenticatedUser();
    } else if (authMode === "guest") {
      syncGuestUser();
    } else {
      setUserId(null);
    }
  }, [
    authMode,
    isAuthLoading,
    isInitializing,
    isConvexAuthReady,
    syncAuthenticatedUser,
    syncGuestUser,
  ]);

  const value = useMemo(
    () => ({
      userId,
      isLoading: isAuthLoading || isInitializing || !isConvexAuthReady,
    }),
    [userId, isAuthLoading, isInitializing, isConvexAuthReady]
  );

  return (
    <ConvexUserContext.Provider value={value}>
      {children}
    </ConvexUserContext.Provider>
  );
}

/**
 * Hook to get just the Convex user ID
 */
export function useConvexUserId(): Id<"users"> | null {
  return useContext(ConvexUserContext).userId;
}
