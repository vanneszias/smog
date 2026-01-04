/**
 * Auth Context for Web Application
 *
 * This wraps WorkOS AuthKit's useAuth hook and provides additional state
 * for Convex user management.
 *
 * For checking if the user is authenticated with Convex (which validates the JWT),
 * use useConvexAuth() from "convex/react" instead.
 */

import { useAuth as useAuthKit } from "@workos-inc/authkit-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  const authKit = useAuthKit();
  const [convexUserId, setConvexUserIdState] = useState<string | null>(() => {
    // Initialize from localStorage
    if (typeof window !== "undefined") {
      return localStorage.getItem(CONVEX_USER_ID_KEY);
    }
    return null;
  });

  // Store workosId in localStorage for API authentication when user changes
  useEffect(() => {
    if (authKit.user?.id) {
      localStorage.setItem(TOKEN_STORAGE_KEY, authKit.user.id);
    } else if (!authKit.isLoading) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, [authKit.user?.id, authKit.isLoading]);

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
      authKit.user
        ? {
            id: authKit.user.id,
            email: authKit.user.email ?? "",
            firstName: authKit.user.firstName ?? undefined,
            lastName: authKit.user.lastName ?? undefined,
          }
        : null,
    [authKit.user]
  );

  const signIn = useCallback(() => {
    authKit.signIn();
  }, [authKit]);

  const signOut = useCallback(() => {
    // Clear Convex user ID and API token on sign out
    setConvexUserId(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    authKit.signOut();
  }, [authKit, setConvexUserId]);

  const value = useMemo(
    () => ({
      user,
      isLoading: authKit.isLoading,
      isAuthenticated: !!authKit.user,
      signIn,
      signOut,
      convexUserId,
      setConvexUserId,
    }),
    [
      user,
      authKit.isLoading,
      authKit.user,
      signIn,
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
