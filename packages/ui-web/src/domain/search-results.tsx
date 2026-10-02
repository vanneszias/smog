import { useTranslation } from "@smog/i18n/react";
import type { ComponentProps, ReactNode } from "react";
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
  extends Omit<ComponentProps<"section">, "children"> {
  /** The next action on the empty state (e.g. clear the categories). */
  emptyAction?: ReactNode;
  items: readonly T[];
  onRetry: () => void;
  /** One result (a GestureCard by default). */
  renderItem?: (item: T, index: number) => ReactNode;
  /** Busy state of the retry button. */
  retrying?: boolean;
  /** Placeholder cards while loading. */
  skeletonCount?: number;
  state: SearchResultsState;
}

/**
 * The search result area: every state of spec §16 (Skeleton, EmptyState,
 * ErrorState) and the results grid. The result count is a polite status
 * that screen readers announce as it changes.
 */
export function SearchResults<T extends GestureCardData>({
  className,
  emptyAction,
  items,
  onRetry,
  renderItem,
  retrying = false,
  skeletonCount = 8,
  state,
  ...props
}: SearchResultsProps<T>): ReactNode {
  const { t } = useTranslation();
  let status = "";
  if (state === "loading") {
    status = t("search.searching");
  } else if (state === "results") {
    status = t("search.resultCount", { count: items.length });
  }
  return (
    <section
      aria-busy={state === "loading"}
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      <p
        className={cn(
          "text-body-sm text-foreground-muted",
          state !== "results" && "sr-only"
        )}
        role="status"
      >
        {status}
      </p>
      {state === "loading" ? <LoadingGrid count={skeletonCount} /> : null}
      {state === "results" ? (
        <GestureGrid items={items} renderItem={renderItem} />
      ) : null}
      {state === "empty" ? <NoResultsEmptyState action={emptyAction} /> : null}
      {state === "error" ? (
        <ErrorState onRetry={onRetry} retrying={retrying} />
      ) : null}
      {state === "idle" ? <SearchIdleEmptyState /> : null}
    </section>
  );
}

function LoadingGrid({ count }: { count: number }): ReactNode {
  return (
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
  );
}
