/**
 * @fileoverview User and authentication domain types
 */

// ===== USER TYPES =====

/**
 * A SMOG application user.
 */
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  emailVerified?: boolean;
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
  user: User | null;
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  signOut: () => Promise<void>;
  isLoading: boolean;
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
