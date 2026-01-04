/**
 * Secure Auth Provider
 *
 * This provider handles authentication securely by storing refresh tokens
 * in httpOnly cookies on the server, preventing XSS attacks from stealing tokens.
 *
 * Flow:
 * 1. User logs in via WorkOS AuthKit (handles OAuth redirect)
 * 2. On callback, we capture the refresh token and send it to our server
 * 3. Server stores refresh token in httpOnly cookie
 * 4. On page reload, we call server to refresh session using the stored token
 * 5. Server returns access token (refresh token never exposed to JS)
 *
 * This provider is compatible with ConvexProviderWithAuth's useAuth interface.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const serverUrl = import.meta.env.VITE_SERVER_URL;

export type SecureAuthUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  profilePictureUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SecureAuthContextType = {
  user: SecureAuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const SecureAuthContext = createContext<SecureAuthContextType | null>(null);

// Store access token in memory only (never in localStorage)
let memoryAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;

async function refreshFromServer(): Promise<{
  accessToken: string;
  user: SecureAuthUser;
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
    console.error("Failed to refresh from server:", error);
  }
  return null;
}

function parseTokenExpiry(accessToken: string): number {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    return payload.exp * 1000;
  } catch {
    // Default to 5 minutes if we can't parse
    return Date.now() + 5 * 60 * 1000;
  }
}

export function SecureAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SecureAuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  // Try to restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const result = await refreshFromServer();
      if (result) {
        memoryAccessToken = result.accessToken;
        tokenExpiresAt = parseTokenExpiry(result.accessToken);
        setUser(result.user);
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  // Handle OAuth callback - check URL for code and exchange it
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
        // Exchange code for tokens via our server
        const response = await fetch(`${serverUrl}/auth/workos/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        if (response.ok) {
          // After callback, refresh to get the session
          const result = await refreshFromServer();
          if (result) {
            memoryAccessToken = result.accessToken;
            tokenExpiresAt = parseTokenExpiry(result.accessToken);
            setUser(result.user);
          }
        }
      } catch (error) {
        console.error("OAuth callback failed:", error);
      }
    };

    handleCallback();
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
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
          setUser(result.user);
          return memoryAccessToken;
        }
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, []);

  const signIn = useCallback(() => {
    const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_WORKOS_REDIRECT_URI;
    const authUrl = `https://authkit.workos.com/?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.assign(authUrl);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch(`${serverUrl}/auth/token/clear`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Failed to clear token:", error);
    }
    memoryAccessToken = null;
    tokenExpiresAt = null;
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      signIn,
      signOut,
      getAccessToken,
    }),
    [user, isLoading, signIn, signOut, getAccessToken]
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
