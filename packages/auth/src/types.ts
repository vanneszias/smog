/**
 * Shared authentication types for the Smog monorepo
 *
 * These types are used across web, native, and server apps to ensure
 * consistent handling of authentication state.
 */

/**
 * User information from WorkOS
 */
export interface WorkOSUser {
  createdAt?: string;
  email: string;
  emailVerified?: boolean;
  firstName?: string;
  id: string;
  lastName?: string;
  profilePictureUrl?: string;
  updatedAt?: string;
}

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
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: WorkOSUser;
}

/**
 * Core authentication state shared across platforms
 */
export interface AuthState {
  authMode: AuthMode;
  guestId: string | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isHandlingOAuthCallback: boolean;
  isLoading: boolean;
  user: WorkOSUser | null;
}

/**
 * Authentication actions available to consumers
 */
export interface AuthActions {
  // Guest mode (optional - only supported on native)
  continueAsGuest?: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  signIn: () => void;
  signOut: () => Promise<void>;
}

/**
 * Complete auth context type combining state and actions
 */
export type AuthContextType = AuthState & AuthActions;

/**
 * Convex auth hook interface - compatible with ConvexProviderWithAuth
 */
export interface ConvexAuthState {
  fetchAccessToken: () => Promise<string | null>;
  isAuthenticated: boolean;
  isLoading: boolean;
}
