import type { GestureSummary } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  ErrorState,
  GestureRow,
  type KitLinkProps,
  NoResultsEmptyState,
  SearchResults,
  type SearchResultsState,
} from "@smog/ui-web";
import { Link, useSearch } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo } from "react";
import { GestureRowsSkeleton, LinkedGestureCard } from "./gesture-cards";
import { gestureHref } from "./links";
import { type Hearts, useHeart } from "./use-hearts";

const GESTURE_PATH = "/gestures/";

/**
 * Desktop rows select the gesture beside the results: the browse route
 * with `?selected=`, masked as `/gestures/<slug>` (the full page on a
 * reload, in a new tab or for a crawler).
 */
function SelectLink({ children, className, href }: KitLinkProps): ReactNode {
  const slug = decodeURIComponent(href.slice(GESTURE_PATH.length));
  const current = useSearch({ from: "/gestures/" });
  const search = useMemo(
    () => ({ ...current, selected: slug }),
    [current, slug]
  );
  const mask = useMemo(
    () => ({ params: { slug }, to: "/gestures/$slug" as const }),
    [slug]
  );
  return (
    <Link
      className={className}
      mask={mask}
      resetScroll={false}
      search={search}
      to="/gestures"
    >
      {children}
    </Link>
  );
}

export interface ResultsViewProps {
  /** The next action on the empty state. */
  emptyAction?: ReactNode;
  /** Under the results: "load more", or a hint to refine. */
  footer?: ReactNode;
  hearts: Hearts;
  items: readonly GestureSummary[];
  onRetry: () => void;
  retrying: boolean;
  /** The slug shown beside the rows (desktop). */
  selected?: string | undefined;
  state: Exclude<SearchResultsState, "idle">;
}

function ResultRow({
  gesture,
  hearts,
  selected,
}: {
  gesture: GestureSummary;
  hearts: Hearts;
  selected: boolean;
}): ReactNode {
  const heart = useHeart(hearts, gesture.id);
  return (
    <GestureRow
      aria-current={selected ? "true" : undefined}
      className={selected ? "bg-primary-subtle" : undefined}
      favorite={heart.active}
      gesture={gesture}
      href={gestureHref(gesture.slug)}
      linkComponent={SelectLink}
      onFavoriteToggle={heart.onToggle}
    />
  );
}

/** The desktop column: dense rows that select a gesture. */
function ResultRows({
  emptyAction,
  footer,
  hearts,
  items,
  onRetry,
  retrying,
  selected,
  state,
}: ResultsViewProps): ReactNode {
  const { t } = useTranslation();
  if (state === "loading") {
    return <GestureRowsSkeleton count={8} />;
  }
  if (state === "error") {
    return <ErrorState onRetry={onRetry} retrying={retrying} />;
  }
  if (state === "empty") {
    return <NoResultsEmptyState action={emptyAction} />;
  }
  return (
    <section className="flex flex-col gap-2">
      <p className="text-body-sm text-foreground-muted" role="status">
        {t("search.resultCount", { count: items.length })}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((gesture) => (
          <li key={gesture.id}>
            <ResultRow
              gesture={gesture}
              hearts={hearts}
              selected={gesture.slug === selected}
            />
          </li>
        ))}
      </ul>
      {footer}
    </section>
  );
}

/**
 * Results in every state (spec §16): the kit SearchResults grid on phones
 * and tablets (cards open the gesture page), dense rows beside the detail
 * from `lg` (master–detail). Only one of the two is displayed.
 */
export function ResultsView(props: ResultsViewProps): ReactNode {
  const { emptyAction, footer, hearts, items, onRetry, retrying, state } =
    props;
  const renderItem = useCallback(
    (gesture: GestureSummary) => (
      <LinkedGestureCard
        from="search_results"
        gesture={gesture}
        hearts={hearts}
        level={2}
      />
    ),
    [hearts]
  );
  return (
    <>
      <div className="flex flex-col gap-4 lg:hidden">
        <SearchResults
          emptyAction={emptyAction}
          items={items}
          onRetry={onRetry}
          renderItem={renderItem}
          retrying={retrying}
          state={state}
        />
        {state === "results" ? footer : null}
      </div>
      <div className="hidden lg:block">
        <ResultRows {...props} />
      </div>
    </>
  );
}
