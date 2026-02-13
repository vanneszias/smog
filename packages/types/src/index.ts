// Core domain types
export interface Gesture {
  id: string;
  name: string;
  category: string[];
  playbackId: string; // MUX playback ID instead of videoUrl
  concept: string[];
  info: string;
}

// Theme types
export interface Theme {
  primary: string;
  secondary: string;
  background: string;
  card: string;
  text: string;
  textLight: string;
  border: string;
  statusBar: "light" | "dark";
}

export interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Favorites types
export interface FavoritesContextType {
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
}

// User types
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  emailVerified?: boolean;
}

// Auth types
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

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

// Category types
export interface Category {
  id: string;
  name: string;
  slug: string;
  count?: number;
}

// Search types
export interface SearchResult {
  gesture: Gesture;
  score: number;
}

export interface SearchFilters {
  categories?: string[];
  query?: string;
}

// Sponsorship types
export type SponsorshipStatus = "pending" | "active" | "expired" | "cancelled";

export interface Sponsorship {
  id: string;
  gestureId: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayImageStorageId: string;
  overlayText: string;
  sponsoredVideoPlaybackId?: string;
  originalVideoPlaybackId: string;
  sponsoredVideoStorageId?: string;
  previewVideoPlaybackId?: string;
  startDate: number;
  endDate: number;
  durationYears: number;
  hasLogo?: boolean;
  contactFullName: string;
  contactCompany?: string;
  status: SponsorshipStatus;
  molliePaymentId?: string;
  paymentAmount: number;
  createdAt: number;
  updatedAt: number;
}

export type GestureWithSponsorship = Gesture & {
  sponsorship: Sponsorship | null;
};

export interface CreateSponsorshipInput {
  gestureId: string;
  sponsorName: string;
  sponsorEmail: string;
  contactFullName: string;
  contactCompany?: string;
  overlayImageFile?: File;
  overlayText: string;
  durationYears: number;
  includeLogo: boolean;
}

// Overlay configuration for video sponsorships
// All positioning uses relative coordinates (percentages 0-100) for video size independence
export interface OverlayConfig {
  // Image properties (relative to video dimensions: 0-100%)
  image: {
    x: number; // X position as percentage (0-100)
    y: number; // Y position as percentage (0-100)
    width: number; // Width as percentage (0-100)
    height: number; // Height as percentage (0-100)
  };

  // Text properties (relative to video dimensions)
  text: {
    x: number; // X position as percentage (0-100)
    y: number; // Y position as percentage (0-100)
    fontSize: number; // Font size as percentage of video height (0-20)
    color: string; // Hex color (e.g., "#000000")
  };

  // Animation properties
  animation: {
    startTime: number; // When to show overlay (seconds from end)
    fadeInDuration: number; // Fade-in duration in seconds
  };
}

// Default configuration matching current hardcoded values
// Updated for enhanced sponsor visibility
// Image: ~238px on 1080p centered (22% width)
// Text: Two-line layout with adjusted positioning
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  image: {
    x: 50, // Center horizontally
    y: 76, // moved up from 79 for better balance with two-line text
    width: 22, // increased from 18 to 22 for better logo clarity
    height: 22, // increased from 18 to 22
  },
  text: {
    x: 50, // Center horizontally
    y: 87, // adjusted for two-line layout (moved down from 83)
    fontSize: 3.8, // slightly reduced from 4.4 to fit two lines
    color: "#00805f",
  },
  animation: {
    startTime: 5, // Last 5 seconds
    fadeInDuration: 1, // 1 second fade-in
  },
};

// Presets
export * from "./presets";
