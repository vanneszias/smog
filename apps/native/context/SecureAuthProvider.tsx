/**
 * Secure Auth Provider for React Native
 *
 * This provider handles authentication by exchanging tokens through the server,
 * similar to the web app implementation. The server handles the WorkOS token
 * exchange and returns access tokens.
 *
 * Flow:
 * 1. User logs in via WorkOS AuthKit (OAuth redirect)
 * 2. On callback, we send the authorization code to our server
 * 3. Server exchanges code with WorkOS and returns access token + refresh token
 * 4. Refresh token is stored securely in SecureStore
 * 5. Access token is kept in memory only
 * 6. On token expiry, we call server to refresh using the stored refresh token
 *
 * This provider is compatible with ConvexProviderWithAuth's useAuth interface.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
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

// Server URL for auth endpoints
const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL;

// Storage keys
const REFRESH_TOKEN_KEY = "smog_refresh_token";
const USER_KEY = "@smog_user";
const GUEST_MODE_KEY = "@smog_guest_mode";
const GUEST_ID_KEY = "@smog_guest_id";

export type SecureAuthUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  profilePictureUrl?: string;
};

type AuthMode = "guest" | "authenticated" | "loading";

type SecureAuthContextType = {
  user: SecureAuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authMode: AuthMode;
  isGuest: boolean;
  guestId: string | null;
  signIn: () => void;
  signOut: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const SecureAuthContext = createContext<SecureAuthContextType | null>(null);

// Store access token in memory only (never persisted)
let memoryAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;

/**
 * Securely store refresh token
 */
async function storeRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch (error) {
    console.error("[SecureAuth] Failed to store refresh token:", error);
  }
}

/**
 * Get stored refresh token
 */
async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error("[SecureAuth] Failed to get refresh token:", error);
    return null;
  }
}

/**
 * Clear stored refresh token
 */
async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error("[SecureAuth] Failed to clear refresh token:", error);
  }
}

/**
 * Parse JWT to get expiry time
 */
function parseTokenExpiry(accessToken: string): number {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    return payload.exp * 1000;
  } catch {
    // Default to 5 minutes if we can't parse
    return Date.now() + 5 * 60 * 1000;
  }
}

/**
 * Refresh access token using stored refresh token via server
 */
async function refreshFromServer(): Promise<{
  accessToken: string;
  refreshToken: string;
  user: SecureAuthUser;
} | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    console.log("[SecureAuth] No refresh token found");
    return null;
  }

  try {
    console.log("[SecureAuth] Refreshing token via server...");
    const response = await fetch(`${serverUrl}/auth/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("[SecureAuth] Token refreshed successfully");
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
    }

    console.error(
      "[SecureAuth] Server refresh failed:",
      response.status,
      await response.text()
    );
  } catch (error) {
    console.error("[SecureAuth] Failed to refresh from server:", error);
  }
  return null;
}

// WorkOS OAuth discovery configuration
const discovery = {
  authorizationEndpoint: "https://api.workos.com/user_management/authorize",
};

export function SecureAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<SecureAuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [guestId, setGuestId] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  // WorkOS OAuth setup
  const redirectUri = makeRedirectUri({
    scheme: "smog",
    path: "auth-callback",
  });

  const clientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID;

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

  // Handle OAuth callback - exchange code for tokens via server
  useEffect(() => {
    if (response?.type !== "success") {
      return;
    }

    const { code } = response.params;

    const exchangeCode = async () => {
      try {
        console.log("[SecureAuth] Exchanging code via server...");
        const exchangeResponse = await fetch(
          `${serverUrl}/auth/workos/callback`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          }
        );

        if (!exchangeResponse.ok) {
          console.error(
            "[SecureAuth] Code exchange failed:",
            await exchangeResponse.text()
          );
          return;
        }

        const data = await exchangeResponse.json();
        console.log("[SecureAuth] Code exchanged, user:", data.user?.email);

        // Store refresh token securely
        if (data.refreshToken) {
          await storeRefreshToken(data.refreshToken);
        }

        // Store access token in memory
        if (data.accessToken) {
          memoryAccessToken = data.accessToken;
          tokenExpiresAt = parseTokenExpiry(data.accessToken);
        }

        // Store user info
        if (data.user) {
          setUser(data.user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }

        // Clear guest mode
        await AsyncStorage.removeItem(GUEST_MODE_KEY);
        await AsyncStorage.removeItem(GUEST_ID_KEY);
        setGuestId(null);
        setAuthMode("authenticated");
      } catch (error) {
        console.error("[SecureAuth] OAuth callback error:", error);
      }
    };

    exchangeCode();
  }, [response]);

  // Try to restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Check for guest mode first
        const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);
        const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);

        if (guestMode === "true") {
          console.log("[SecureAuth] Restoring guest mode");
          setGuestId(storedGuestId);
          setAuthMode("guest");
          setIsLoading(false);
          return;
        }

        // Check for stored user
        const storedUser = await AsyncStorage.getItem(USER_KEY);
        if (!storedUser) {
          console.log("[SecureAuth] No stored session found");
          setIsLoading(false);
          return;
        }

        // Try to refresh token
        const result = await refreshFromServer();
        if (result) {
          memoryAccessToken = result.accessToken;
          tokenExpiresAt = parseTokenExpiry(result.accessToken);

          // Update stored refresh token
          await storeRefreshToken(result.refreshToken);

          setUser(result.user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
          setAuthMode("authenticated");
        } else {
          // Refresh failed, clear stored data
          console.log("[SecureAuth] Session restore failed, clearing data");
          await clearRefreshToken();
          await AsyncStorage.removeItem(USER_KEY);
        }
      } catch (error) {
        console.error("[SecureAuth] Session restore error:", error);
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // If not authenticated, return null
    if (authMode !== "authenticated") {
      return null;
    }

    // If token is still valid (with 60s buffer), return it
    if (
      memoryAccessToken &&
      tokenExpiresAt &&
      Date.now() < tokenExpiresAt - 60_000
    ) {
      return memoryAccessToken;
    }

    // Deduplicate concurrent refresh requests
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        const result = await refreshFromServer();
        if (result) {
          memoryAccessToken = result.accessToken;
          tokenExpiresAt = parseTokenExpiry(result.accessToken);
          await storeRefreshToken(result.refreshToken);
          setUser(result.user);
          return memoryAccessToken;
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
      console.log("[SecureAuth] Starting OAuth flow");
      promptAsync();
    } else {
      console.error("[SecureAuth] OAuth request not ready");
    }
  }, [request, promptAsync]);

  const signOut = useCallback(async () => {
    try {
      console.log("[SecureAuth] Signing out...");
      memoryAccessToken = null;
      tokenExpiresAt = null;
      await clearRefreshToken();
      await AsyncStorage.removeItem(USER_KEY);
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      await AsyncStorage.removeItem(GUEST_ID_KEY);
      setUser(null);
      setGuestId(null);
      setAuthMode("loading");
    } catch (error) {
      console.error("[SecureAuth] Sign out error:", error);
    }
  }, []);

  const continueAsGuest = useCallback(async () => {
    try {
      let currentGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      if (!currentGuestId) {
        currentGuestId = generateGuestId();
        await AsyncStorage.setItem(GUEST_ID_KEY, currentGuestId);
      }
      await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
      setGuestId(currentGuestId);
      setAuthMode("guest");
    } catch (error) {
      console.error("[SecureAuth] Continue as guest error:", error);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: authMode === "authenticated",
      authMode,
      isGuest: authMode === "guest",
      guestId,
      signIn,
      signOut,
      continueAsGuest,
      getAccessToken,
    }),
    [
      user,
      isLoading,
      authMode,
      guestId,
      signIn,
      signOut,
      continueAsGuest,
      getAccessToken,
    ]
  );

  return (
    <SecureAuthContext.Provider value={value}>
      {children}
    </SecureAuthContext.Provider>
  );
}

/**
 * Hook to access secure authentication state and methods.
 */
export function useSecureAuth() {
  const context = useContext(SecureAuthContext);
  if (!context) {
    throw new Error("useSecureAuth must be used within SecureAuthProvider");
  }
  return context;
}

/**
 * Hook compatible with Convex's useAuth interface.
 * Use this with ConvexProviderWithAuth.
 */
export function useAuthForConvex() {
  const { isLoading, user, getAccessToken } = useSecureAuth();

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
