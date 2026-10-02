import type { GestureViewSource } from "@smog/analytics/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  GestureCard,
  type GestureCardData,
  GestureGrid,
  type KitLinkComponent,
  Skeleton,
} from "@smog/ui-web";
import { type ReactNode, useCallback } from "react";
import { gestureHref, RouterLink } from "./links";
import { type Hearts, useHeart } from "./use-hearts";

/** A card that links to the gesture page (`from`: this screen), with its heart. */
export function LinkedGestureCard({
  from,
  gesture,
  hearts,
  level,
  linkComponent = RouterLink,
}: {
  from?: GestureViewSource | undefined;
  gesture: GestureCardData;
  hearts: Hearts;
  level?: 2 | 3 | 4;
  linkComponent?: KitLinkComponent;
}): ReactNode {
  const heart = useHeart(hearts, gesture.id);
  return (
    <GestureCard
      favorite={heart.active}
      gesture={gesture}
      href={gestureHref(gesture.slug, from)}
      level={level}
      linkComponent={linkComponent}
      onFavoriteToggle={heart.onToggle}
    />
  );
}

/** A grid of linked cards with hearts. */
export function LinkedGestureGrid({
  className,
  from,
  hearts,
  items,
  level,
}: {
  /** Merged into the kit grid (e.g. fewer columns for a short row). */
  className?: string;
  /** Where the cards open the gesture from (`gesture_viewed`). */
  from?: GestureViewSource | undefined;
  hearts: Hearts;
  items: readonly GestureCardData[];
  level?: 2 | 3 | 4;
}): ReactNode {
  const renderItem = useCallback(
    (gesture: GestureCardData) => (
      <LinkedGestureCard
        from={from}
        gesture={gesture}
        hearts={hearts}
        level={level}
      />
    ),
    [from, hearts, level]
  );
  return (
    <GestureGrid className={className} items={items} renderItem={renderItem} />
  );
}

/** Placeholder cards in the grid's columns (decorative; the region is busy). */
export function GestureGridSkeleton({
  count = 8,
}: {
  count?: number;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p className="sr-only" role="status">
        {t("states.loading")}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: count }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical, static placeholders
          <div className="flex flex-col gap-2" key={index}>
            <Skeleton className="aspect-3/4 h-auto" shape="rect" />
            <Skeleton className="w-3/4" />
            <Skeleton className="w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder rows for dense lists. */
export function GestureRowsSkeleton({
  count = 6,
}: {
  count?: number;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-1">
      <p className="sr-only" role="status">
        {t("states.loading")}
      </p>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical, static placeholders
        <div className="flex items-center gap-3 px-2 py-2" key={index}>
          <Skeleton className="h-12 w-9" shape="rect" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="w-1/2" />
            <Skeleton className="w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
