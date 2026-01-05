import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSecureAuth } from "./SecureAuthProvider";

const GUEST_ID_KEY = "@smog_guest_id";

type ConvexUserContextType = {
  userId: Id<"users"> | null;
};

const ConvexUserContext = createContext<ConvexUserContextType>({
  userId: null,
});

/**
 * Component that handles Convex user synchronization.
 * Must be rendered inside ConvexProviderWithAuth and SecureAuthProvider.
 *
 * This component:
 * 1. Creates/migrates users in Convex database
 * 2. Provides the Convex user ID to the app
 */
export const ConvexUserSync: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isOffline } = useNetworkStatus();
  const { authMode, user, guestId, isLoading: isAuthLoading } = useSecureAuth();
  const [userId, setUserId] = useState<Id<"users"> | null>(null);

  // Convex mutations
  const createUser = useMutation(api.users.createUser);
  const migrateGuestToUser = useMutation(api.users.migrateGuestToUser);

  // Convex queries for user lookup
  const getUserByWorkOSId = useQuery(
    api.users.getUserByWorkOSId,
    user?.id ? { workosId: user.id } : "skip"
  );
  const getUserByGuestId = useQuery(
    api.users.getUserByGuestId,
    guestId ? { guestId } : "skip"
  );

  // Handle user creation/migration when auth state changes
  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    // Skip Convex operations when offline
    if (isOffline) {
      console.log(
        "[ConvexUserSync] Offline mode - skipping Convex user operations"
      );
      return;
    }

    const handleAuthenticatedUser = async () => {
      if (!user?.id) {
        return;
      }

      if (getUserByWorkOSId && getUserByWorkOSId !== null) {
        setUserId(getUserByWorkOSId._id);
        return;
      }

      if (getUserByWorkOSId === null) {
        const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
        if (storedGuestId) {
          console.log(
            "[ConvexUserSync] Migrating guest to authenticated user..."
          );
          const migratedUserId = await migrateGuestToUser({
            guestId: storedGuestId,
            workosId: user.id,
          });
          setUserId(migratedUserId);
        } else {
          console.log("[ConvexUserSync] Creating new authenticated user...");
          const createdUserId = await createUser({ workosId: user.id });
          setUserId(createdUserId);
        }
      }
    };

    const handleGuestUser = async () => {
      if (!guestId) {
        return;
      }

      if (getUserByGuestId && getUserByGuestId !== null) {
        setUserId(getUserByGuestId._id);
      } else if (getUserByGuestId === null) {
        console.log("[ConvexUserSync] Creating new guest user...");
        const newUserId = await createUser({ guestId });
        setUserId(newUserId);
      }
    };

    const handleUserSetup = async () => {
      if (authMode === "authenticated" && user?.id) {
        await handleAuthenticatedUser();
      } else if (authMode === "guest" && guestId) {
        await handleGuestUser();
      } else {
        // Not authenticated or guest - clear userId
        setUserId(null);
      }
    };

    handleUserSetup().catch(console.error);
  }, [
    user,
    authMode,
    guestId,
    getUserByWorkOSId,
    getUserByGuestId,
    isAuthLoading,
    isOffline,
    createUser,
    migrateGuestToUser,
  ]);

  const value = useMemo(() => ({ userId }), [userId]);

  return (
    <ConvexUserContext.Provider value={value}>
      {children}
    </ConvexUserContext.Provider>
  );
};

/**
 * Hook to get the current Convex user ID
 */
export function useConvexUserId() {
  return useContext(ConvexUserContext).userId;
}
