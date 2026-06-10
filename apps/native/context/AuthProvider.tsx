/**
 * Native Authentication Provider
 *
 * Provides secure authentication for the native app using WorkOS.
 *
 * Security:
 * - Refresh tokens stored in SecureStore (native secure storage)
 * - Access tokens stored in memory only
 * - Server-side token exchange for OAuth codes
 *
 * Guest Mode:
 * - Users can continue without signing in
 * - Guest ID generated using expo-crypto for security
 * - Guest data migrates to authenticated account on sign in
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthContextType, AuthMode, WorkOSUser } from "@smog/auth";
import { isTokenExpired } from "@smog/auth";
import { makeRedirectUri, useAuthRequest } from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { maybeCompleteAuthSession } from "expo-web-browser";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateGuestId } from "@/services/userService";
import logger from "@/utils/logger";

maybeCompleteAuthSession();

// Configuration
const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL;
const clientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID || "";

// Storage keys
const REFRESH_TOKEN_KEY = "smog_refresh_token";
const USER_KEY = "@smog_user";
const GUEST_MODE_KEY = "@smog_guest_mode";
const GUEST_ID_KEY = "@smog_guest_id";

// In-memory token storage (access token only - never persisted)
let accessToken: string | null = null;

// WorkOS OAuth discovery
const discovery = {
  authorizationEndpoint: "https://api.workos.com/user_management/authorize",
};

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Store refresh token securely
 */
async function storeRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch (error) {
    logger.error("[Auth] Failed to store refresh token:", error);
  }
}

/**
 * Get stored refresh token
 */
async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    logger.error("[Auth] Failed to get refresh token:", error);
    return null;
  }
}

/**
 * Clear refresh token
 */
async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    logger.error("[Auth] Failed to clear refresh token:", error);
  }
}

/**
 * Refresh session from server
 */
async function refreshSession(): Promise<{
  accessToken: string;
  refreshToken: string;
  user: WorkOSUser;
} | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${serverUrl}/auth/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
    }
  } catch (error) {
    logger.error("[Auth] Session refresh failed:", error);
  }
  return null;
}

async function isNetworkAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/health`, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    logger.error("[Auth] Network check failed:", error);
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<WorkOSUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [guestId, setGuestId] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  // OAuth setup
  const redirectUri = makeRedirectUri({
    scheme: "smog",
    path: "auth-callback",
  });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId,
      scopes: [],
      redirectUri,
      responseType: "code",
      extraParams: { provider: "authkit" },
    },
    discovery
  );

  // Handle OAuth callback
  useEffect(() => {
    if (response?.type !== "success") {
      return;
    }

    const { code } = response.params;

    const exchangeCode = async () => {
      try {
        // Get code_verifier from the auth request for PKCE flow
        const codeVerifier = request?.codeVerifier;

        const exchangeResponse = await fetch(
          `${serverUrl}/auth/workos/callback`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, codeVerifier }),
          }
        );

        if (!exchangeResponse.ok) {
          logger.error("[Auth] Code exchange failed");
          return;
        }

        const data = await exchangeResponse.json();

        // Store tokens
        if (data.refreshToken) {
          await storeRefreshToken(data.refreshToken);
        }
        if (data.accessToken) {
          accessToken = data.accessToken;
        }

        // Store user
        if (data.user) {
          setUser(data.user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }

        // Clear guest mode
        await Promise.all(
          [GUEST_MODE_KEY, GUEST_ID_KEY].map((k) => AsyncStorage.removeItem(k))
        );
        setGuestId(null);
        setAuthMode("authenticated");
      } catch (error) {
        logger.error("[Auth] OAuth callback error:", error);
      }
    };

    exchangeCode();
  }, [response, request]);

  // Restore session on mount
  useEffect(() => {
    const finalizeRestore = (mode: AuthMode) => {
      setAuthMode(mode);
      setIsLoading(false);
    };

    const restoreAuthenticatedSession = async (
      storedUser: string
    ): Promise<AuthMode> => {
      const parsedUser = JSON.parse(storedUser) as WorkOSUser;
      setUser(parsedUser);

      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        return "unauthenticated";
      }

      const isOnline = await isNetworkAvailable();
      if (!isOnline) {
        return "authenticated";
      }

      const result = await refreshSession();
      if (!result) {
        await clearRefreshToken();
        await AsyncStorage.removeItem(USER_KEY);
        return "unauthenticated";
      }

      accessToken = result.accessToken;
      await storeRefreshToken(result.refreshToken);
      setUser(result.user);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
      return "authenticated";
    };

    const restoreSession = async () => {
      try {
        // Check guest mode first
        const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);
        const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);

        if (guestMode === "true") {
          setGuestId(storedGuestId);
          finalizeRestore("guest");
          return;
        }

        // Try to restore authenticated session
        const storedUser = await AsyncStorage.getItem(USER_KEY);
        if (!storedUser) {
          finalizeRestore("unauthenticated");
          return;
        }

        const mode = await restoreAuthenticatedSession(storedUser);
        finalizeRestore(mode);
      } catch (error) {
        logger.error("[Auth] Session restore error:", error);
        finalizeRestore("unauthenticated");
      }
    };

    restoreSession();
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (authMode !== "authenticated") {
      return null;
    }

    // Return cached token if valid
    if (accessToken && !isTokenExpired(accessToken)) {
      return accessToken;
    }

    const isOnline = await isNetworkAvailable();
    if (!isOnline) {
      return null;
    }

    // Deduplicate concurrent refresh requests
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        const result = await refreshSession();
        if (result) {
          accessToken = result.accessToken;
          await storeRefreshToken(result.refreshToken);
          setUser(result.user);
          return accessToken;
        }
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [authMode]);

  const signIn = useCallback(() => {
    if (request) {
      promptAsync();
    } else {
      logger.error("[Auth] OAuth request not ready");
    }
  }, [request, promptAsync]);

  const signOut = useCallback(async () => {
    accessToken = null;
    await clearRefreshToken();
    await Promise.all(
      [USER_KEY, GUEST_MODE_KEY, GUEST_ID_KEY].map((k) =>
        AsyncStorage.removeItem(k)
      )
    );
    setUser(null);
    setGuestId(null);
    setAuthMode("unauthenticated");
  }, []);

  const continueAsGuest = useCallback(async () => {
    let currentGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
    if (!currentGuestId) {
      currentGuestId = generateGuestId();
      await AsyncStorage.setItem(GUEST_ID_KEY, currentGuestId);
    }
    await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
    setGuestId(currentGuestId);
    setAuthMode("guest");
  }, []);

  const value = useMemo(
    (): AuthContextType => ({
      user,
      isLoading,
      isAuthenticated: authMode === "authenticated",
      authMode,
      isGuest: authMode === "guest",
      guestId,
      signIn,
      signOut,
      getAccessToken,
      continueAsGuest,
    }),
    [
      user,
      isLoading,
      authMode,
      guestId,
      signIn,
      signOut,
      getAccessToken,
      continueAsGuest,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication state and methods
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

/**
 * Hook compatible with Convex's useAuth interface
 * Use this with ConvexProviderWithAuth
 */
export function useAuthForConvex() {
  const { isLoading, user, getAccessToken } = useAuth();

  const fetchAccessToken = useCallback(async () => {
    try {
      return await getAccessToken();
    } catch {
      return null;
    }
  }, [getAccessToken]);

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated: !!user,
      fetchAccessToken,
    }),
    [isLoading, user, fetchAccessToken]
  );
}

// Re-export for backwards compatibility
