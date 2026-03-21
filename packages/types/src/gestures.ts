/**
 * @fileoverview Gesture domain types
 *
 * All types related to sign-language gestures, categories, and search.
 */

// ===== GESTURE TYPES =====

/**
 * A single sign-language gesture with its video playback information.
 */
export interface Gesture {
  id: string;
  name: string;
  /** Array of category names this gesture belongs to */
  category: string[];
  /** Mux playback ID for the gesture video */
  playbackId: string;
  /** Related concepts / synonyms for the gesture */
  concept: string[];
  /** Additional descriptive information */
  info: string;
}

/**
 * A gesture enriched with its current sponsorship (if any).
 */
export type GestureWithSponsorship = Gesture & {
  sponsorship: import("./sponsorships").Sponsorship | null;
};

/**
 * A gesture with its sponsorship availability status for display on the
 * sponsor-selection screen.
 */
export interface GestureWithSponsorshipStatus extends Gesture {
  /** Whether this gesture already has an active or pending sponsorship */
  isSponsored: boolean;
  /** ISO date-string of when the current sponsorship ends, if any */
  sponsoredUntil?: string;
}

// ===== CATEGORY TYPES =====

/**
 * A gesture category.
 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  /** Number of gestures in this category */
  count?: number;
}

// ===== SEARCH TYPES =====

/**
 * A search result pairing a gesture with its relevance score.
 */
export interface SearchResult {
  gesture: Gesture;
  /** Relevance score — higher is more relevant */
  score: number;
}

/**
 * Filters that can be applied to gesture search.
 */
export interface SearchFilters {
  categories?: string[];
  query?: string;
}
