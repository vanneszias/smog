import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@smog/convex";
import { useAction, useMutation, useQuery } from "convex/react";
import type React from "react";
import { useEffect } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useAuth, useTokenContext } from "./AuthContext";

const GUEST_ID_KEY = "@smog_guest_id";

/**
 * Component that handles Convex user synchronization.
 * Must be rendered inside ConvexProviderWithAuth.
 *
 * This component:
 * 1. Exchanges OAuth codes for tokens via Convex action
 * 2. Creates/migrates users in Convex
 * 3. Syncs user IDs back to AuthContext
 */
export const ConvexUserSync: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isOffline } = useNetworkStatus();
  const {
    authMode,
    user,
    guestId,
    setUserId,
    pendingOAuthCode,
    clearPendingOAuthCode,
    onTokenExchangeSuccess,
    isLoading: isAuthLoading,
  } = useAuth();
  const { setRefreshTokenAction } = useTokenContext();

  // Convex mutations and actions
  const createUser = useMutation(api.users.createUser);
  const migrateGuestToUser = useMutation(api.users.migrateGuestToUser);
  const exchangeCode = useAction(api.users.exchangeCodeForToken);
  const refreshAccessTokenAction = useAction(api.users.refreshAccessToken);

  // Convex queries for user lookup
  const getUserByWorkOSId = useQuery(
    api.users.getUserByWorkOSId,
    user?.id ? { workosId: user.id } : "skip"
  );
  const getUserByGuestId = useQuery(
    api.users.getUserByGuestId,
    guestId ? { guestId } : "skip"
  );

  // Register the refresh token action with AuthContext
  useEffect(() => {
    setRefreshTokenAction(refreshAccessTokenAction);
    return () => setRefreshTokenAction(null);
  }, [refreshAccessTokenAction, setRefreshTokenAction]);

  // Handle OAuth code exchange
  useEffect(() => {
    if (!pendingOAuthCode || isOffline) {
      return;
    }

    const exchangeCodeForUser = async () => {
      try {
        console.log("[ConvexUserSync] Exchanging code for user and tokens...");

        const result = await exchangeCode({
          code: pendingOAuthCode.code,
          redirectUri: pendingOAuthCode.redirectUri,
        });

        await onTokenExchangeSuccess({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: {
            id: result.workosId,
            email: result.email,
            firstName: result.firstName,
            lastName: result.lastName,
          },
        });

        clearPendingOAuthCode();
      } catch (error) {
        console.error(
          "[ConvexUserSync] Error exchanging code for user:",
          error
        );
        clearPendingOAuthCode();
      }
    };

    exchangeCodeForUser();
  }, [
    pendingOAuthCode,
    isOffline,
    exchangeCode,
    onTokenExchangeSuccess,
    clearPendingOAuthCode,
  ]);

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
      if (getUserByWorkOSId && getUserByWorkOSId !== null) {
        setUserId(getUserByWorkOSId._id);
        return;
      }

      if (getUserByWorkOSId === null) {
        const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
        if (storedGuestId) {
          const migratedUserId = await migrateGuestToUser({
            guestId: storedGuestId,
            workosId: user?.id || "",
          });
          setUserId(migratedUserId);
        } else {
          const createdUserId = await createUser({ workosId: user?.id || "" });
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
        const newUserId = await createUser({ guestId });
        setUserId(newUserId);
      }
    };

    const handleUserSetup = async () => {
      if (user?.id && authMode === "authenticated") {
        await handleAuthenticatedUser();
      } else if (authMode === "guest" && guestId) {
        await handleGuestUser();
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
    setUserId,
  ]);

  return <>{children}</>;
};
