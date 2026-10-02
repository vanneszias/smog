import { useTranslation } from "@smog/i18n/react";
import type { ReactNode } from "react";
import { EmptyState, type EmptyStateProps } from "../components/empty-state";

/*
 * The learning flow's empty states: EmptyState with its copy and a brand
 * hand. Each takes the next action (`action`), and any EmptyState prop
 * overrides the defaults.
 */

export type DomainEmptyStateProps = EmptyStateProps;

/** Favorites: nothing hearted yet. */
export function FavoritesEmptyState(props: DomainEmptyStateProps): ReactNode {
  const { t } = useTranslation();
  return (
    <EmptyState
      description={t("favorites.empty.description")}
      illustration={1}
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
      illustration={2}
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
      illustration={2}
      title={t("lists.emptyList.title")}
      {...props}
    />
  );
}

/** Search: nothing matched the words and categories. */
export function NoResultsEmptyState(props: DomainEmptyStateProps): ReactNode {
  const { t } = useTranslation();
  return (
    <EmptyState
      description={t("search.noResults.description")}
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
      illustration={0}
      title={t("search.idle.title")}
      {...props}
    />
  );
}
