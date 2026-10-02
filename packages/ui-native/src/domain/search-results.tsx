import { useTranslation } from "@smog/i18n/react";
import { type ReactElement, type ReactNode, useEffect } from "react";
import {
  AccessibilityInfo,
  Platform,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { ErrorState } from "../components/error-state";
import { Skeleton } from "../components/skeleton";
import { cn } from "../lib/cn";
import { NoResultsEmptyState, SearchIdleEmptyState } from "./empty-states";
import { GestureGrid } from "./gesture-grid";
import type { GestureCardData } from "./types";

export type SearchResultsState =
  | "idle"
  | "loading"
  | "empty"
  | "error"
  | "results";

export interface SearchResultsProps<T extends GestureCardData>
  extends Omit<ViewProps, "children"> {
  className?: string;
  /** The next action on the empty state (e.g. clear the categories). */
  emptyAction?: ReactNode;
  items: readonly T[];
  /** Loads the next page when the grid nears its end (native lists load on scroll). */
  onEndReached?: () => void;
  onRetry: () => void;
  /** One result (a GestureCard by default). */
  renderItem?: (item: T, index: number) => ReactNode;
  retrying?: boolean;
  /** `false` inside another vertical ScrollView. */
  scrollEnabled?: boolean;
  /** Placeholder cards while loading. */
  skeletonCount?: number;
  state: SearchResultsState;
}

/**
 * The search result area, as web: Skeleton, EmptyState, ErrorState and the
 * grid. The count is a polite live region (Android) and is announced on iOS.
 */
export function SearchResults<T extends GestureCardData>({
  className,
  emptyAction,
  items,
  onEndReached,
  onRetry,
  renderItem,
  retrying = false,
  scrollEnabled,
  skeletonCount = 4,
  state,
  ...props
}: SearchResultsProps<T>): ReactElement {
  const { t } = useTranslation();
  let status = "";
  if (state === "loading") {
    status = t("search.searching");
  } else if (state === "results") {
    status = t("search.resultCount", { count: items.length });
  }
  useEffect(() => {
    if (status && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(status);
    }
  }, [status]);
  return (
    <View
      accessibilityState={{ busy: state === "loading" }}
      className={cn("flex-col gap-3", className)}
      {...props}
    >
      {state === "results" ? (
        <Text
          accessibilityLiveRegion="polite"
          className="px-4 text-body-sm text-foreground-muted"
        >
          {status}
        </Text>
      ) : null}
      {state === "loading" ? <LoadingGrid count={skeletonCount} /> : null}
      {state === "results" ? (
        <GestureGrid
          contentContainerClassName="px-4 pb-6"
          items={items}
          onEndReached={onEndReached}
          renderItem={renderItem}
          scrollEnabled={scrollEnabled}
        />
      ) : null}
      {state === "empty" ? <NoResultsEmptyState action={emptyAction} /> : null}
      {state === "error" ? (
        <ErrorState onRetry={onRetry} retrying={retrying} />
      ) : null}
      {state === "idle" ? <SearchIdleEmptyState /> : null}
    </View>
  );
}

const CARD_STYLE = { aspectRatio: 3 / 4 } as const;

function LoadingGrid({ count }: { count: number }): ReactElement {
  return (
    <View className="flex-row flex-wrap gap-3 px-4">
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical, static placeholders
        <View className="w-5/12 grow flex-col gap-2" key={index}>
          <Skeleton
            className="h-auto rounded-lg"
            style={CARD_STYLE}
            testID="search-skeleton"
          />
          <Skeleton className="w-3/4" shape="text" />
        </View>
      ))}
    </View>
  );
}
