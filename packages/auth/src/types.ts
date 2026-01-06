/**
 * Shared authentication types for the Smog monorepo
 *
 * These types are used across web, native, and server apps to ensure
 * consistent handling of authentication state.
 */

/**
 * User information from WorkOS
 */
export type WorkOSUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  profilePictureUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Authentication mode - describes the current auth state
 */
export type AuthMode =
  | "loading"
  | "guest"
  | "authenticated"
  | "unauthenticated";

/**
 * Token response from auth server
 */
export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  user: WorkOSUser;
};

/**
 * Core authentication state shared across platforms
 */
export type AuthState = {
  user: WorkOSUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authMode: AuthMode;
  isGuest: boolean;
  guestId: string | null;
};

/**
 * Authentication actions available to consumers
 */
export type AuthActions = {
  signIn: () => void;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  // Guest mode (optional - only supported on native)
  continueAsGuest?: () => Promise<void>;
};

/**
 * Complete auth context type combining state and actions
 */
export type AuthContextType = AuthState & AuthActions;

/**
 * Convex auth hook interface - compatible with ConvexProviderWithAuth
 */
export type ConvexAuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: () => Promise<string | null>;
};
