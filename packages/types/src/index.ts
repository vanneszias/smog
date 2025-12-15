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

// Sponsorship types
export type SponsorshipStatus = "pending" | "active" | "expired" | "cancelled";

export type Sponsorship = {
  id: string;
  gestureId: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayImageStorageId: string;
  overlayText: string;
  sponsoredVideoPlaybackId?: string;
  originalVideoPlaybackId: string;
  sponsoredVideoStorageId?: string;
  startDate: number;
  endDate: number;
  durationWeeks: number;
  status: SponsorshipStatus;
  molliePaymentId?: string;
  paymentAmount: number;
  createdAt: number;
  updatedAt: number;
};

export type GestureWithSponsorship = Gesture & {
  sponsorship: Sponsorship | null;
};

export type CreateSponsorshipInput = {
  gestureId: string;
  sponsorName: string;
  sponsorEmail: string;
  overlayImageFile: File;
  overlayText: string;
  durationWeeks: number;
};

export type SponsorshipPricing = {
  pricePerWeekCents: number;
  weeks: number;
  totalCents: number;
};

// Overlay configuration for video sponsorships
// All positioning uses relative coordinates (percentages 0-100) for video size independence
export type OverlayConfig = {
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
};

// Default configuration matching current hardcoded values
// Image: 200px on 1080p centered, 220px from bottom
// Text: 48px on 1080p centered, 180px from bottom
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  image: {
    x: 50, // Center horizontally
    y: 79, // 220px from bottom on 1080p = ~79%
    width: 18, // 200px on 1080p width (1920) = ~10.4%, but using 18% for better visibility
    height: 18, // 200px on 1080p height = ~18.5%
  },
  text: {
    x: 50, // Center horizontally
    y: 83, // 180px from bottom on 1080p = ~83%
    fontSize: 4.4, // 48px on 1080p = ~4.4%
    color: "#000000",
  },
  animation: {
    startTime: 5, // Last 5 seconds
    fadeInDuration: 1, // 1 second fade-in
  },
};

// Presets
export * from "./presets";
