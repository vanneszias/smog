/**
 * @fileoverview User and authentication domain types
 */

// ===== USER TYPES =====

/**
 * A SMOG application user.
 */
export interface User {
  email: string;
  emailVerified?: boolean;
  firstName?: string;
  id: string;
  lastName?: string;
  username?: string;
}

// ===== AUTH TYPES =====

/**
 * The three possible authentication lifecycle states.
 */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Shape of the authentication context exposed by `AuthProvider`.
 */
export interface AuthContextType {
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  status: AuthStatus;
  user: User | null;
}

// ===== FAVORITES TYPES =====

/**
 * Shape of the favorites context exposed by `FavoritesProvider`.
 */
export interface FavoritesContextType {
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
}
