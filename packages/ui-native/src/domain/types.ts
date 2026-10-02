/*
 * Structural prop types for the domain components, the same as
 * `@smog/ui-web`'s. The kits stay feature-agnostic (the package graph does
 * not let them import `@smog/gestures/schema`); `GestureSummary` and
 * `SearchResult` from that schema are assignable to `GestureCardData`.
 */

/** A category as the chips and cards show it. */
export interface CategoryRef {
  name: string;
  slug: string;
}

/** What a card or row needs of a gesture (`GestureSummary` fits). */
export interface GestureCardData {
  categories: readonly CategoryRef[];
  id: string;
  name: string;
  playbackId: string;
  slug: string;
}
