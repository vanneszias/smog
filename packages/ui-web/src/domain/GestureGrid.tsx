"use client";

/* A client component: it hands `onFavorite` and a `renderLink` closure to `GestureCard`, and functions do not serialize across a client boundary.
 * Why this is per file and not on the barrel: see `src/index.ts`. */

import { SearchX } from "lucide-react";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { cn } from "../lib/cn";
import { GestureCard, type GestureSummary } from "./GestureCard";

const DEFAULT_SKELETON_COUNT = 6;

const GRID_CLASSES =
  "grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

/**
 * Stable keys for the placeholders.
 *
 * They are derived from the count rather than from a `map` index so the keys
 * survive a change of `skeletonCount` without React reusing a placeholder in
 * a different slot — and so nothing keys a list on an array index.
 */
const skeletonKeys = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `gesture-skeleton-${index}`);

export type GestureGridProps = Omit<
  HTMLAttributes<HTMLUListElement>,
  "children"
> & {
  gestures: readonly GestureSummary[];
  /** Placeholders instead of cards. Wins over the empty state. */
  loading?: boolean;
  skeletonCount?: number;
  /** The ids that are favourited, so each card can report its own state. */
  favoriteIds?: readonly string[];
  onFavorite?: (id: string) => void;
  /** Per-gesture navigation, by composition. See `GestureCard`. */
  renderGestureLink?: (
    gesture: GestureSummary,
    children: ReactNode
  ) => ReactNode;
  /** The list's accessible name, so two grids on one page are told apart. */
  label?: string;
  loadingLabel?: string;
  emptyIcon?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
};

/**
 * A grid of gesture cards, plus the two states a list of loaded data has
 * besides "here it is".
 *
 * **`loading` wins over `empty`.** An empty array during the first request is
 * both, and the branch order is the whole difference between "no gestures
 * found" and "still looking". Telling a reader their search found nothing
 * before the request has come back is a lie the reader acts on, so the
 * placeholders come first — asserted by name in `GestureGrid.test.tsx`.
 *
 * The cards are a `<ul>`: a screen reader then announces how many gestures
 * there are before reading any of them, which a pile of `<div>`s cannot say.
 */
export const GestureGrid = forwardRef<HTMLUListElement, GestureGridProps>(
  (
    {
      className,
      gestures,
      loading = false,
      skeletonCount = DEFAULT_SKELETON_COUNT,
      favoriteIds,
      onFavorite,
      renderGestureLink,
      label = "Gebaren",
      loadingLabel = "Gebaren laden",
      emptyIcon = <SearchX aria-hidden="true" className="size-8" />,
      emptyTitle = "Geen gebaren gevonden",
      emptyDescription,
      emptyAction,
      ...props
    },
    ref
  ) => {
    if (loading) {
      return (
        // biome-ignore lint/a11y/useSemanticElements: <output> takes phrasing content only, and this region is a grid of block placeholders — the suggested element cannot legally contain what a loading grid is made of. A polite live region on a div is all role="status" is, and it is what tells a reader the list is still loading.
        <div
          aria-busy="true"
          aria-label={loadingLabel}
          className={cn(GRID_CLASSES, className)}
          role="status"
        >
          {skeletonKeys(skeletonCount).map((key) => (
            <Skeleton className="h-24 w-full" key={key} />
          ))}
        </div>
      );
    }

    if (gestures.length === 0) {
      return (
        <EmptyState
          action={emptyAction}
          description={emptyDescription}
          icon={emptyIcon}
          title={emptyTitle}
        />
      );
    }

    const favorites = new Set(favoriteIds ?? []);

    return (
      <ul
        aria-label={label}
        className={cn(GRID_CLASSES, className)}
        ref={ref}
        {...props}
      >
        {gestures.map((gesture) => (
          <li key={gesture.id}>
            <GestureCard
              gesture={gesture}
              isFavorite={favorites.has(gesture.id)}
              onFavorite={onFavorite}
              renderLink={
                renderGestureLink == null
                  ? undefined
                  : (children) => renderGestureLink(gesture, children)
              }
            />
          </li>
        ))}
      </ul>
    );
  }
);

GestureGrid.displayName = "GestureGrid";
