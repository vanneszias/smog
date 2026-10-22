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

/**
 * A gesture in a grid, video first: a large still (3:4) with a play glyph,
 * the name, the category badge and the heart.
 */
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
        "group/card relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-0 ring-1 ring-foreground/10",
        href !== undefined &&
          cn("hover:shadow-2 dark:hover:ring-border", transition),
        className
      )}
      {...props}
    >
      <GestureThumbnail playbackId={gesture.playbackId} showPlay width={480} />
      <div className="flex min-w-0 flex-col items-start gap-1.5 p-3">
        <Heading className="w-full truncate font-semibold text-body">
          <GestureLink href={href} linkComponent={linkComponent}>
            {gesture.name}
          </GestureLink>
        </Heading>
        {categories ? (
          <Badge
            className="max-w-full"
            data-slot="gesture-category"
            variant="primary"
          >
            <span className="truncate">{categories}</span>
          </Badge>
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
