/**
 * Web Authentication Provider
 *
 * Provides secure authentication for the web app using WorkOS.
 *
 * Security:
 * - Refresh tokens stored in httpOnly cookies (not accessible to JavaScript)
 * - Access tokens stored in memory only (cleared on page close)
 * - Server-side token refresh (refresh token never exposed to client JS)
 */

import {
  type AuthContextType,
  buildAuthorizationUrl,
  getTokenExpiry,
  isTokenExpired,
  type WorkOSUser,
} from "@smog/auth";
import { createLogger } from "@smog/shared";
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
import { setORPCAccessTokenProvider } from "../utils/orpc";

const logger = createLogger("auth");

const serverUrl = import.meta.env.VITE_SERVER_URL;
const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID;
const redirectUri = import.meta.env.VITE_WORKOS_REDIRECT_URI;

// In-memory token storage (never persisted)
let accessToken: string | null = null;
let tokenExpiry: number | null = null;

type WebAuthContextType = Omit<AuthContextType, "continueAsGuest">;

const AuthContext = createContext<WebAuthContextType | null>(null);

/**
 * Refresh session from server using httpOnly cookie
 */
async function refreshSession(): Promise<{
  accessToken: string;
  user: WorkOSUser;
} | null> {
  try {
    const response = await fetch(`${serverUrl}/auth/token/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      return {
        accessToken: data.accessToken,
        user: data.user,
      };
    }
  } catch (error) {
    logger.error("[Auth] Session refresh failed:", error);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<WorkOSUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const result = await refreshSession();
      if (result) {
        accessToken = result.accessToken;
        tokenExpiry = getTokenExpiry(result.accessToken);
        setUser(result.user);
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  // Handle OAuth callback from URL
  useEffect(() => {
    const handleCallback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (!code) {
        return;
      }

      // Clear URL params
      window.history.replaceState({}, "", url.pathname);

      try {
        const response = await fetch(`${serverUrl}/auth/workos/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        if (response.ok) {
          // Refresh session to get user data
          const result = await refreshSession();
          if (result) {
            accessToken = result.accessToken;
            tokenExpiry = getTokenExpiry(result.accessToken);
            setUser(result.user);
          }
        }
      } catch (error) {
        logger.error("[Auth] OAuth callback failed:", error);
      }
    };

    handleCallback();
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // Return cached token if still valid
    if (accessToken && tokenExpiry && !isTokenExpired(accessToken)) {
      return accessToken;
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
          tokenExpiry = getTokenExpiry(result.accessToken);
          setUser(result.user);
          return accessToken;
        }
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, []);

  const signIn = useCallback(() => {
    const authUrl = buildAuthorizationUrl({ clientId, redirectUri });
    window.location.assign(authUrl);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch(`${serverUrl}/auth/token/clear`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      logger.error("[Auth] Sign out failed:", error);
    }
    accessToken = null;
    tokenExpiry = null;
    setUser(null);
  }, []);

  const value = useMemo(
    (): WebAuthContextType => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      authMode: isLoading
        ? "loading"
        : user
          ? "authenticated"
          : "unauthenticated",
      isGuest: false,
      guestId: null,
      signIn,
      signOut,
      getAccessToken,
    }),
    [user, isLoading, signIn, signOut, getAccessToken]
  );

  // Register access token provider for ORPC client
  useEffect(() => {
    setORPCAccessTokenProvider(getAccessToken);
    return () => {
      setORPCAccessTokenProvider(null);
    };
  }, [getAccessToken]);

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
