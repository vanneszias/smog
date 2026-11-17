import { useTranslation } from "@smog/i18n/react";
import type { ReactNode } from "react";
import { Button } from "../components/button";
import { EmptyState, type EmptyStateProps } from "../components/empty-state";
import { HAND } from "../components/hand-illustration";
import type { KitLinkComponent, KitLinkProps } from "./types";

/*
 * The learning flow's empty states: EmptyState with its copy and the brand
 * hand of its meaning (`HAND`: the open palm for nothing here yet, the hand
 * pointing across for search and no results). Each takes the next action (`action`), and any EmptyState prop
 * overrides the defaults.
 */

export type DomainEmptyStateProps = EmptyStateProps;

/** Favorites: nothing hearted yet. */
export function FavoritesEmptyState(props: DomainEmptyStateProps): ReactNode {
  const { t } = useTranslation();
  return (
    <EmptyState
      description={t("favorites.empty.description")}
      illustration={HAND.welcome}
      title={t("favorites.empty.title")}
      {...props}
    />
  );
}

/** Lists: no lists yet. */
export function ListsEmptyState(props: DomainEmptyStateProps): ReactNode {
  const { t } = useTranslation();
  return (
    <EmptyState
      description={t("lists.empty.description")}
      illustration={HAND.welcome}
      title={t("lists.empty.title")}
      {...props}
    />
  );
}

/** A list without gestures. */
export function ListItemsEmptyState(props: DomainEmptyStateProps): ReactNode {
  const { t } = useTranslation();
  return (
    <EmptyState
      description={t("lists.emptyList.description")}
      illustration={HAND.welcome}
      title={t("lists.emptyList.title")}
      {...props}
    />
  );
}

function PlainLink({ children, className, href }: KitLinkProps): ReactNode {
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

export interface NoResultsEmptyStateProps extends DomainEmptyStateProps {
  /** Web only: the site's router link for the suggestions (a plain `<a>` by default). */
  linkComponent?: KitLinkComponent;
  /**
   * Clears what was typed and chosen (the next step out of a dead end):
   * a "Clear the search" button, unless `action` replaces it.
   */
  onClear?: () => void;
  /**
   * Near matches to offer ("Did you mean"), when the search already has
   * them: each a gesture name and where it goes. At most six are shown.
   */
  suggestions?: readonly { href: string; name: string }[];
}

/**
 * Search: nothing matched the words and categories. The hand points
 * across (search), and there is always a way on: the near matches when
 * the caller has them, and "Clear the search" (`onClear`) or the caller's
 * own `action`.
 */
export function NoResultsEmptyState({
  action,
  linkComponent,
  onClear,
  suggestions,
  ...props
}: NoResultsEmptyStateProps): ReactNode {
  const { t } = useTranslation();
  const Link = linkComponent ?? PlainLink;
  const shown = suggestions?.slice(0, 6) ?? [];
  const clear = onClear ? (
    <Button onClick={onClear} variant="secondary">
      {t("stateActions.noResults.clear")}
    </Button>
  ) : null;
  const next = action ?? clear;
  return (
    <EmptyState
      action={
        shown.length > 0 || next ? (
          <div className="flex flex-col items-center gap-4">
            {shown.length > 0 ? (
              <nav
                aria-label={t("stateActions.noResults.suggestions")}
                className="flex flex-col items-center gap-2"
              >
                <p className="text-body-sm text-muted-foreground">
                  {t("stateActions.noResults.suggestions")}
                </p>
                <ul className="flex flex-wrap justify-center gap-2">
                  {shown.map((suggestion) => (
                    <li key={suggestion.href}>
                      <Link
                        className="inline-flex min-h-touch items-center rounded-pill border border-input bg-card px-4 font-medium text-body-sm text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        href={suggestion.href}
                      >
                        {suggestion.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {next}
          </div>
        ) : undefined
      }
      data-slot="no-results"
      description={t("search.noResults.description")}
      illustration={HAND.search}
      title={t("search.noResults.title")}
      {...props}
    />
  );
}

/** Search before anything is typed or chosen. */
export function SearchIdleEmptyState(props: DomainEmptyStateProps): ReactNode {
  const { t } = useTranslation();
  return (
    <EmptyState
      description={t("search.idle.description")}
      illustration={HAND.search}
      title={t("search.idle.title")}
      {...props}
    />
  );
}
