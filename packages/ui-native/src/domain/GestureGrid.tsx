import { FlashList } from "@shopify/flash-list";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { cn } from "../lib/cn";
import { GestureCard, type GestureSummary } from "./GestureCard";

const DEFAULT_SKELETON_COUNT = 6;

/** Stable keys for the placeholders — see `packages/ui-web`'s own `skeletonKeys`. */
const skeletonKeys = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `gesture-skeleton-${index}`);

export type GestureGridProps = Omit<ViewProps, "children" | "style"> & {
  gestures: readonly GestureSummary[];
  /**
   * Renders one gesture. Defaults to a plain `GestureCard`; a caller wanting
   * favourites or navigation passes its own, closing over whatever it needs
   * — the same composition `renderGestureLink`/`onFavorite` give web's
   * `GestureGrid`, but as one prop, because `FlashList.renderItem` is
   * already the seam a phone list renders items through.
   */
  renderItem?: (gesture: GestureSummary) => ReactNode;
  /** Fired once per approach to the end of the list, for pagination. */
  onEndReached?: () => void;
  /** Placeholders instead of cards. Wins over `empty`. */
  loading?: boolean;
  /** Rendered in place of the list for an empty, not-loading array. */
  empty?: ReactNode;
  className?: string;
};

/**
 * A virtualised list of gesture cards, plus the two states a list of loaded
 * data has besides "here it is".
 *
 * **`loading` wins over `empty`.** An empty array during the first request is
 * both, and the branch order is the whole difference between "no gestures
 * found" and "still looking" — same rule as `packages/ui-web`'s own
 * `GestureGrid`, asserted the same way in this component's own test.
 *
 * Built on `@shopify/flash-list` rather than mapping the array over a `View`:
 * a phone list is not bounded the way a page's grid is, and virtualising it
 * is what keeps a list of hundreds of gestures from mounting hundreds of
 * cards at once.
 */
export function GestureGrid({
  className,
  empty,
  gestures,
  loading = false,
  onEndReached,
  renderItem,
  testID = "root",
  ...props
}: GestureGridProps) {
  if (loading) {
    return (
      <View
        accessibilityLabel="Gebaren laden"
        accessibilityRole="progressbar"
        className={cn("gap-sm", className)}
        testID={testID}
        {...props}
      >
        {skeletonKeys(DEFAULT_SKELETON_COUNT).map((key) => (
          <Skeleton className="h-24 w-full" key={key} />
        ))}
      </View>
    );
  }

  if (gestures.length === 0) {
    return (
      <View className={className} testID={testID} {...props}>
        {empty ?? <EmptyState title="Geen gebaren gevonden" />}
      </View>
    );
  }

  return (
    <FlashList
      className={className}
      data={gestures}
      keyExtractor={(gesture) => gesture.id}
      onEndReached={onEndReached}
      renderItem={({ item }) => (
        <>{renderItem ? renderItem(item) : <GestureCard gesture={item} />}</>
      )}
      testID={testID}
      {...props}
    />
  );
}
