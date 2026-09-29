import type { ComponentType, ReactNode } from "react";

/*
 * Structural prop types for the domain components. The kits stay
 * feature-agnostic (the package graph does not let them import
 * `@smog/gestures/schema`); `GestureSummary` and `SearchResult` from that
 * schema are assignable to `GestureCardData`, so screens pass them as is.
 * ui-native declares the same types.
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

/** The props the kit gives a link it renders. */
export interface KitLinkProps {
  children?: ReactNode;
  className?: string;
  href: string;
}

/**
 * Web only: the element a card or row renders its link with. Defaults to a
 * plain `<a>`; the site passes its router link so navigation stays in the app.
 */
export type KitLinkComponent = ComponentType<KitLinkProps>;
