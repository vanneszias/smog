import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Id } from "@smog/convex/dataModel";
import { makeRedirectUri, useAuthRequest } from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { maybeCompleteAuthSession } from "expo-web-browser";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateGuestId } from "@/services/userService";

maybeCompleteAuthSession();

type AuthMode = "guest" | "authenticated" | "loading";

type WorkOSUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

type AuthContextType = {
  authMode: AuthMode;
  isGuest: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: WorkOSUser | null;
  userId: Id<"users"> | null;
  guestId: string | null;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  clearGuestMode: () => Promise<void>;
  signIn: () => void;
  signUp: () => void;
  // Internal setter for user ID (used by ConvexUserSync)
  setUserId: (id: Id<"users"> | null) => void;
  // Pending OAuth code to be exchanged (used by ConvexUserSync)
  pendingOAuthCode: { code: string; redirectUri: string } | null;
  clearPendingOAuthCode: () => void;
  // Called by ConvexUserSync after successful token exchange
  onTokenExchangeSuccess: (params: {
    accessToken: string;
    refreshToken?: string;
    user: WorkOSUser;
  }) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token context for Convex authentication
type TokenContextType = {
  accessToken: string | null;
  refreshToken: string | null;
  isTokenLoading: boolean;
  fetchAccessToken: () => Promise<string | null>;
  // Internal setter for refresh token action (used by ConvexUserSync)
  setRefreshTokenAction: (
    action:
      | ((params: { refreshToken: string }) => Promise<{
          accessToken: string;
          refreshToken?: string;
        }>)
      | null
  ) => void;
};

const TokenContext = createContext<TokenContextType | undefined>(undefined);

const GUEST_MODE_KEY = "@smog_guest_mode";
const GUEST_ID_KEY = "@smog_guest_id";
const USER_KEY = "@smog_user";

// Secure storage keys for tokens
const ACCESS_TOKEN_KEY = "smog_access_token";
const REFRESH_TOKEN_KEY = "smog_refresh_token";

// WorkOS OAuth discovery configuration
const discovery = {
  authorizationEndpoint: "https://api.workos.com/user_management/authorize",
  tokenEndpoint: "https://api.workos.com/user_management/token",
};

/**
 * Securely store a value using expo-secure-store
 */
async function secureStore(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error(`[SecureStore] Failed to store ${key}:`, error);
  }
}

/**
 * Securely retrieve a value from expo-secure-store
 */
async function secureRetrieve(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error(`[SecureStore] Failed to retrieve ${key}:`, error);
    return null;
  }
}

/**
 * Securely delete a value from expo-secure-store
 */
async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error(`[SecureStore] Failed to delete ${key}:`, error);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [isInitialized, setIsInitialized] = useState(false);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [user, setUser] = useState<WorkOSUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(true);
  const [pendingOAuthCode, setPendingOAuthCode] = useState<{
    code: string;
    redirectUri: string;
  } | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Store the refresh action so it can be called without Convex context
  const refreshTokenActionRef = useRef<
    | ((params: { refreshToken: string }) => Promise<{
        accessToken: string;
        refreshToken?: string;
      }>)
    | null
  >(null);

  // WorkOS OAuth setup
  const redirectUri = makeRedirectUri({
    scheme: "smog",
    path: "auth-callback",
  });

  const clientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID;

  console.log("[AuthContext] OAuth config:", {
    clientId: clientId ? `${clientId.substring(0, 10)}...` : "NOT SET",
    redirectUri,
  });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: clientId || "",
      scopes: [],
      redirectUri,
      responseType: "code",
      extraParams: {
        provider: "authkit",
      },
    },
    discovery
  );

  const setRefreshTokenAction = useCallback(
    (
      action:
        | ((params: { refreshToken: string }) => Promise<{
            accessToken: string;
            refreshToken?: string;
          }>)
        | null
    ) => {
      refreshTokenActionRef.current = action;
    },
    []
  );

  /**
   * Fetch a valid access token, refreshing if necessary.
   * This is called by ConvexProviderWithAuth.
   */
  const fetchAccessToken = useCallback(async (): Promise<string | null> => {
    // If we have a token, return it
    if (accessToken) {
      return accessToken;
    }

    // If not authenticated, return null
    if (authMode !== "authenticated") {
      return null;
    }

    // Try to get token from secure storage
    const storedToken = await secureRetrieve(ACCESS_TOKEN_KEY);
    if (storedToken) {
      setAccessToken(storedToken);
      return storedToken;
    }

    // Try to refresh using refresh token
    const storedRefreshToken = await secureRetrieve(REFRESH_TOKEN_KEY);
    if (storedRefreshToken && refreshTokenActionRef.current) {
      try {
        console.log("[AuthContext] Refreshing access token...");
        const result = await refreshTokenActionRef.current({
          refreshToken: storedRefreshToken,
        });

        setAccessToken(result.accessToken);
        await secureStore(ACCESS_TOKEN_KEY, result.accessToken);

        if (result.refreshToken) {
          setRefreshToken(result.refreshToken);
          await secureStore(REFRESH_TOKEN_KEY, result.refreshToken);
        }

        return result.accessToken;
      } catch (error) {
        console.error("[AuthContext] Failed to refresh token:", error);
        // Token refresh failed - user needs to re-authenticate
        return null;
      }
    }

    return null;
  }, [accessToken, authMode]);

  /**
   * Called by ConvexUserSync after successful OAuth code exchange
   */
  const onTokenExchangeSuccess = useCallback(
    async (params: {
      accessToken: string;
      refreshToken?: string;
      user: WorkOSUser;
    }) => {
      console.log(
        "[AuthContext] WorkOS user authenticated:",
        params.user.email
      );

      // Store tokens securely
      await secureStore(ACCESS_TOKEN_KEY, params.accessToken);
      setAccessToken(params.accessToken);

      if (params.refreshToken) {
        await secureStore(REFRESH_TOKEN_KEY, params.refreshToken);
        setRefreshToken(params.refreshToken);
      }

      setUser(params.user);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(params.user));
      setAuthMode("authenticated");

      // Clear guest mode when user signs in
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      await AsyncStorage.removeItem(GUEST_ID_KEY);
      setGuestId(null);

      console.log("[AuthContext] User authentication completed with tokens");
    },
    []
  );

  const clearPendingOAuthCode = useCallback(() => {
    setPendingOAuthCode(null);
  }, []);

  // Handle OAuth response - store code for ConvexUserSync to process
  useEffect(() => {
    if (response?.type === "success") {
      const { code } = response.params;
      console.log("[AuthContext] OAuth success, storing code for processing");
      setPendingOAuthCode({ code, redirectUri });
    } else if (response?.type === "error") {
      console.error("[AuthContext] OAuth error:", response.error);
    }
  }, [response, redirectUri]);

  const initializeAuth = useCallback(async () => {
    try {
      setIsTokenLoading(true);

      const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);
      const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      const storedUser = await AsyncStorage.getItem(USER_KEY);

      // Try to load stored tokens
      const storedAccessToken = await secureRetrieve(ACCESS_TOKEN_KEY);
      const storedRefreshToken = await secureRetrieve(REFRESH_TOKEN_KEY);

      if (storedAccessToken) {
        setAccessToken(storedAccessToken);
      }
      if (storedRefreshToken) {
        setRefreshToken(storedRefreshToken);
      }

      let newAuthMode: AuthMode;

      if (storedUser) {
        console.log(
          "[AuthContext] User found in storage during initialization"
        );
        setUser(JSON.parse(storedUser));
        newAuthMode = "authenticated";
      } else if (guestMode === "true") {
        console.log("[AuthContext] User in guest mode during initialization");
        newAuthMode = "guest";
        if (storedGuestId) {
          setGuestId(storedGuestId);
        } else {
          // Generate new guest ID if not exists
          const newGuestId = generateGuestId();
          setGuestId(newGuestId);
          await AsyncStorage.setItem(GUEST_ID_KEY, newGuestId);
        }
      } else {
        console.log("[AuthContext] No auth state, setting to loading");
        newAuthMode = "loading"; // Show welcome screen with options
      }

      console.log(`[AuthContext] Initial auth mode set to: ${newAuthMode}`);
      setAuthMode(newAuthMode);
      setIsInitialized(true);
      setIsTokenLoading(false);
    } catch (error) {
      console.error("Error checking auth state:", error);
      setAuthMode("loading");
      setIsInitialized(true);
      setIsTokenLoading(false);
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    if (isInitialized) {
      return;
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Initialize immediately (no external SDK to wait for)
    initializeAuth();

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isInitialized, initializeAuth]);

  const continueAsGuest = useCallback(async () => {
    try {
      // Generate or retrieve guest ID
      let currentGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      if (!currentGuestId) {
        currentGuestId = generateGuestId();
        await AsyncStorage.setItem(GUEST_ID_KEY, currentGuestId);
      }

      await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
      setGuestId(currentGuestId);
      setAuthMode("guest");
    } catch (error) {
      console.error("Error setting guest mode:", error);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Clear all auth data
      await AsyncStorage.removeItem(USER_KEY);
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      await AsyncStorage.removeItem(GUEST_ID_KEY);

      // Clear tokens from secure storage
      await secureDelete(ACCESS_TOKEN_KEY);
      await secureDelete(REFRESH_TOKEN_KEY);

      setAuthMode("loading");
      setUserId(null);
      setGuestId(null);
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  }, []);

  const clearGuestMode = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      await AsyncStorage.removeItem(GUEST_ID_KEY);
      setAuthMode("loading");
      setUserId(null);
      setGuestId(null);
    } catch (error) {
      console.error("Error clearing guest mode:", error);
    }
  }, []);

  // Trigger OAuth flow for sign in
  const signIn = useCallback(() => {
    if (request) {
      console.log("[AuthContext] Starting WorkOS OAuth sign-in flow");
      console.log("[AuthContext] Redirect URI:", redirectUri);
      promptAsync();
    } else {
      console.error("[AuthContext] OAuth request not ready");
    }
  }, [request, promptAsync, redirectUri]);

  // For sign up, we use the same OAuth flow
  const signUp = useCallback(() => {
    if (request) {
      console.log("[AuthContext] Starting WorkOS OAuth sign-up flow");
      console.log("[AuthContext] Redirect URI:", redirectUri);
      promptAsync();
    } else {
      console.error("[AuthContext] OAuth request not ready");
    }
  }, [request, promptAsync, redirectUri]);

  const authValue: AuthContextType = useMemo(
    () => ({
      authMode,
      isGuest: authMode === "guest",
      isAuthenticated: authMode === "authenticated",
      isLoading: !isInitialized,
      user,
      userId,
      guestId,
      continueAsGuest,
      signOut,
      clearGuestMode,
      signIn,
      signUp,
      setUserId,
      pendingOAuthCode,
      clearPendingOAuthCode,
      onTokenExchangeSuccess,
    }),
    [
      authMode,
      isInitialized,
      user,
      userId,
      guestId,
      continueAsGuest,
      signOut,
      clearGuestMode,
      signIn,
      signUp,
      pendingOAuthCode,
      clearPendingOAuthCode,
      onTokenExchangeSuccess,
    ]
  );

  const tokenValue: TokenContextType = useMemo(
    () => ({
      accessToken,
      refreshToken,
      isTokenLoading,
      fetchAccessToken,
      setRefreshTokenAction,
    }),
    [
      accessToken,
      refreshToken,
      isTokenLoading,
      fetchAccessToken,
      setRefreshTokenAction,
    ]
  );

  return (
    <AuthContext.Provider value={authValue}>
      <TokenContext.Provider value={tokenValue}>
        {children}
      </TokenContext.Provider>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const useTokenContext = () => {
  const context = useContext(TokenContext);
  if (context === undefined) {
    throw new Error("useTokenContext must be used within an AuthProvider");
  }
  return context;
};

/**
 * Hook for ConvexProviderWithAuth to get authentication state.
 * This hook provides the interface that Convex expects for authentication.
 */
export function useConvexAuth() {
  const authContext = useContext(AuthContext);
  const tokenContext = useContext(TokenContext);

  if (authContext === undefined) {
    throw new Error("useConvexAuth must be used within an AuthProvider");
  }

  if (tokenContext === undefined) {
    throw new Error("useConvexAuth must be used within an AuthProvider");
  }

  const isLoading = authContext.isLoading || tokenContext.isTokenLoading;
  const hasToken = tokenContext.accessToken !== null;
  const isAuthenticated = authContext.isAuthenticated && hasToken;

  return {
    isLoading,
    isAuthenticated,
    fetchAccessToken: tokenContext.fetchAccessToken,
  };
}
