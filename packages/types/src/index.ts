// Core domain types
export type Gesture = {
  id: string;
  name: string;
  category: string[];
  playbackId: string; // MUX playback ID instead of videoUrl
  concept: string[];
  info: string;
};

// Theme types
export type Theme = {
  primary: string;
  secondary: string;
  background: string;
  card: string;
  text: string;
  textLight: string;
  border: string;
  statusBar: "light" | "dark";
};

export type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

// Favorites types
export type FavoritesContextType = {
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
};

// User types
export type User = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  emailVerified?: boolean;
};

// Auth types
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthContextType = {
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
};

// Category types
export type Category = {
  id: string;
  name: string;
  slug: string;
  count?: number;
};

// Search types
export type SearchResult = {
  gesture: Gesture;
  score: number;
};

export type SearchFilters = {
  categories?: string[];
  query?: string;
};
