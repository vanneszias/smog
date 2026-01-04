/**
 * Auth Context for Web Application
 *
 * This wraps the secure auth provider and adds additional state
 * for Convex user management.
 *
 * For checking if the user is authenticated with Convex (which validates the JWT),
 * use useConvexAuth() from "convex/react" instead.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSecureAuth } from "./secure-auth-provider";

export type WorkOSUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

type AuthContextType = {
  user: WorkOSUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
  convexUserId: string | null;
  setConvexUserId: (id: string | null) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const CONVEX_USER_ID_KEY = "smog_web_convex_user_id";
const TOKEN_STORAGE_KEY = "smog_web_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const secureAuth = useSecureAuth();
  const [convexUserId, setConvexUserIdState] = useState<string | null>(() => {
    // Initialize from localStorage
    if (typeof window !== "undefined") {
      return localStorage.getItem(CONVEX_USER_ID_KEY);
    }
    return null;
  });

  // Store workosId in localStorage for API authentication when user changes
  useEffect(() => {
    if (secureAuth.user?.id) {
      localStorage.setItem(TOKEN_STORAGE_KEY, secureAuth.user.id);
    } else if (!secureAuth.isLoading) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, [secureAuth.user?.id, secureAuth.isLoading]);

  // Clear convexUserId if user is not authenticated (stale data from another session/device)
  useEffect(() => {
    if (secureAuth.isLoading || secureAuth.user) {
      return;
    }
    setConvexUserIdState(null);
    localStorage.removeItem(CONVEX_USER_ID_KEY);
  }, [secureAuth.isLoading, secureAuth.user]);

  const setConvexUserId = useCallback((id: string | null) => {
    setConvexUserIdState(id);
    if (id) {
      localStorage.setItem(CONVEX_USER_ID_KEY, id);
    } else {
      localStorage.removeItem(CONVEX_USER_ID_KEY);
    }
  }, []);

  const user = useMemo(
    () =>
      secureAuth.user
        ? {
            id: secureAuth.user.id,
            email: secureAuth.user.email ?? "",
            firstName: secureAuth.user.firstName ?? undefined,
            lastName: secureAuth.user.lastName ?? undefined,
          }
        : null,
    [secureAuth.user]
  );

  const signOut = useCallback(async () => {
    // Clear Convex user ID and API token on sign out
    setConvexUserId(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    await secureAuth.signOut();
  }, [secureAuth, setConvexUserId]);

  const value = useMemo(
    () => ({
      user,
      isLoading: secureAuth.isLoading,
      isAuthenticated: !!secureAuth.user,
      signIn: secureAuth.signIn,
      signOut,
      convexUserId,
      setConvexUserId,
    }),
    [
      user,
      secureAuth.isLoading,
      secureAuth.user,
      secureAuth.signIn,
      signOut,
      convexUserId,
      setConvexUserId,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication state and methods.
 *
 * Note: For checking authentication status with Convex, use useConvexAuth() instead.
 * This hook returns the WorkOS user state, while useConvexAuth() confirms the JWT
 * has been validated by the Convex backend.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
