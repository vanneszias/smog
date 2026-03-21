/**
 * Convex User Sync for Web
 *
 * Creates and synchronizes users in the Convex database based on WorkOS auth state.
 * This ensures every authenticated user has a corresponding Convex user record.
 */

import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { createLogger } from "@smog/shared";
import { useMutation, useQuery } from "convex/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth";

const logger = createLogger("convexUserSync");

interface ConvexUserContextType {
  userId: Id<"users"> | null;
  isLoading: boolean;
}

const ConvexUserContext = createContext<ConvexUserContextType>({
  userId: null,
  isLoading: true,
});

/**
 * Provider that syncs WorkOS users to Convex database
 * Must be rendered inside ConvexProviderWithAuth and AuthProvider
 */
export function ConvexUserSync({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Convex mutations
  const createUser = useMutation(api.users.createUser);

  // Query for existing user by WorkOS ID
  const existingUser = useQuery(
    api.users.getUserByWorkOSId,
    user?.id ? { workosId: user.id } : "skip"
  );

  // Handle user creation when auth state changes
  useEffect(() => {
    if (isAuthLoading || isInitializing) {
      return;
    }

    const syncUser = async () => {
      // Not authenticated - clear user
      if (!(isAuthenticated && user?.id)) {
        setUserId(null);
        return;
      }

      // User already exists in Convex
      if (existingUser) {
        setUserId(existingUser._id);
        return;
      }

      // User doesn't exist yet - create them
      if (existingUser === null) {
        setIsInitializing(true);
        try {
          const newUserId = await createUser({ workosId: user.id });
          setUserId(newUserId);
        } catch (error) {
          logger.error("[ConvexUserSync] Failed to create user:", error);
        } finally {
          setIsInitializing(false);
        }
      }
    };

    syncUser();
  }, [
    user,
    isAuthenticated,
    existingUser,
    isAuthLoading,
    isInitializing,
    createUser,
  ]);

  const value = useMemo(
    () => ({
      userId,
      isLoading:
        isAuthLoading || isInitializing || (isAuthenticated && !userId),
    }),
    [userId, isAuthLoading, isInitializing, isAuthenticated]
  );

  return (
    <ConvexUserContext.Provider value={value}>
      {children}
    </ConvexUserContext.Provider>
  );
}

/**
 * Hook to get the current Convex user ID
 */
export function useConvexUser() {
  return useContext(ConvexUserContext);
}

/**
 * Hook that returns just the user ID (for backwards compatibility)
 */
export function useConvexUserId(): Id<"users"> | null {
  return useContext(ConvexUserContext).userId;
}
