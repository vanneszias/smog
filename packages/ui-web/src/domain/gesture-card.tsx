import { useTranslation } from "@smog/i18n/react";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "../components/badge";
import { cn } from "../lib/cn";
import { transition } from "../lib/variants";
import { FavoriteButton } from "./favorite-button";
import { categoryLine, GestureLink, GestureThumbnail } from "./gesture-parts";
import type { GestureCardData, KitLinkComponent } from "./types";

export interface GestureCardProps
  extends Omit<ComponentProps<"article">, "children"> {
  /** Whether the gesture is a favorite (the heart's state). */
  favorite?: boolean;
  gesture: GestureCardData;
  /** The gesture page; the whole card links there. */
  href?: string;
  /** Heading level of the name (3 by default). */
  level?: 2 | 3 | 4;
  /** Web only: the site's router link (a plain `<a>` by default). */
  linkComponent?: KitLinkComponent;
  /** Shows the heart; called with the next state. */
  onFavoriteToggle?: (favorite: boolean) => void;
  /** Shows the `gesture.sponsored` badge. */
  sponsored?: boolean;
}

/** A gesture in a grid: its still (3:4), name and categories, and the heart. */
export function GestureCard({
  className,
  favorite = false,
  gesture,
  href,
  level = 3,
  linkComponent,
  onFavoriteToggle,
  sponsored = false,
  ...props
}: GestureCardProps): ReactNode {
  const { t } = useTranslation();
  const Heading = `h${level}` as const;
  const categories = categoryLine(gesture.categories);
  return (
    <article
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface text-foreground",
        href !== undefined &&
          cn(
            "hover:shadow-1 dark:hover:border-border dark:hover:bg-surface-raised",
            transition
          ),
        className
      )}
      {...props}
    >
      <GestureThumbnail playbackId={gesture.playbackId} width={480} />
      <div className="flex min-w-0 flex-col gap-0.5 p-3">
        <Heading className="truncate font-semibold text-title-3">
          <GestureLink href={href} linkComponent={linkComponent}>
            {gesture.name}
          </GestureLink>
        </Heading>
        {categories ? (
          <p className="truncate text-body-sm text-foreground-muted">
            {categories}
          </p>
        ) : null}
      </div>
      {sponsored ? (
        <Badge
          className="pointer-events-none absolute top-2 left-2"
          variant="accent"
        >
          {t("gesture.sponsored")}
        </Badge>
      ) : null}
      {onFavoriteToggle ? (
        <FavoriteButton
          active={favorite}
          className="absolute top-2 right-2"
          onToggle={onFavoriteToggle}
          variant="overlay"
        />
      ) : null}
    </article>
  );
}
