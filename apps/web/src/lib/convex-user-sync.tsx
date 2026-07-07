/**
 * Convex User Sync for Web
 *
 * Creates and synchronizes users in the Convex database based on WorkOS auth state.
 * This ensures every authenticated user has a corresponding Convex user record.
 */

import type { Id } from "@smog/convex/dataModel";
import { createLogger } from "@smog/shared";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { client } from "../utils/orpc";
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
  const workosId = user?.id ?? null;
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [syncedWorkosId, setSyncedWorkosId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [syncFailedFor, setSyncFailedFor] = useState<string | null>(null);

  // Handle user creation when auth state changes
  useEffect(() => {
    if (isAuthLoading || isInitializing) {
      return;
    }

    const syncUser = async () => {
      // Not authenticated - clear user
      if (!(isAuthenticated && workosId)) {
        setUserId(null);
        setSyncedWorkosId(null);
        setSyncFailedFor(null);
        return;
      }

      if (userId && syncedWorkosId === workosId) {
        return;
      }

      if (syncFailedFor === workosId) {
        return;
      }

      setIsInitializing(true);
      try {
        const syncedUser = await client.users.getOrCreateUser();
        if (syncedUser) {
          setUserId(syncedUser._id);
          setSyncedWorkosId(workosId);
          setSyncFailedFor(null);
        }
      } catch (error) {
        logger.error("[ConvexUserSync] Failed to sync user:", error);
        setSyncFailedFor(workosId);
      } finally {
        setIsInitializing(false);
      }
    };

    syncUser();
  }, [
    workosId,
    userId,
    syncedWorkosId,
    syncFailedFor,
    isAuthenticated,
    isAuthLoading,
    isInitializing,
  ]);

  const value = useMemo(
    () => ({
      userId,
      isLoading:
        isAuthLoading ||
        isInitializing ||
        (isAuthenticated &&
          !(userId && syncedWorkosId === workosId) &&
          syncFailedFor !== workosId),
    }),
    [
      userId,
      syncedWorkosId,
      isAuthLoading,
      isInitializing,
      isAuthenticated,
      syncFailedFor,
      workosId,
    ]
  );

  return (
    <ConvexUserContext.Provider value={value}>
      {children}
    </ConvexUserContext.Provider>
  );
}

/**
 * Hook that returns just the user ID (for backwards compatibility)
 */
export function useConvexUserId(): Id<"users"> | null {
  return useContext(ConvexUserContext).userId;
}
