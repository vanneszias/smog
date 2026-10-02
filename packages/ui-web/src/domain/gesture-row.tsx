import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { transition } from "../lib/variants";
import { FavoriteButton } from "./favorite-button";
import { categoryLine, GestureLink, GestureThumbnail } from "./gesture-parts";
import type { GestureCardData, KitLinkComponent } from "./types";

export interface GestureRowProps
  extends Omit<ComponentProps<"div">, "children"> {
  /** A leading slot for a list's drag handle. */
  dragHandle?: ReactNode;
  favorite?: boolean;
  gesture: GestureCardData;
  href?: string;
  /** Web only: the site's router link (a plain `<a>` by default). */
  linkComponent?: KitLinkComponent;
  onFavoriteToggle?: (favorite: boolean) => void;
  /** A trailing slot before the heart (a row menu). */
  trailing?: ReactNode;
}

/** The dense list variant of GestureCard: a small still, name, categories and the heart. */
export function GestureRow({
  className,
  dragHandle,
  favorite = false,
  gesture,
  href,
  linkComponent,
  onFavoriteToggle,
  trailing,
  ...props
}: GestureRowProps): ReactNode {
  const categories = categoryLine(gesture.categories);
  return (
    <div
      className={cn(
        "relative flex min-h-touch min-w-0 items-center gap-3 rounded-md px-2 py-2 text-foreground",
        href !== undefined && cn("hover:bg-surface-sunken", transition),
        className
      )}
      {...props}
    >
      {/* Slots sit above the stretched link. */}
      {dragHandle ? (
        <div className="relative z-10 flex shrink-0">{dragHandle}</div>
      ) : null}
      <GestureThumbnail
        className="h-12 rounded-sm"
        playbackId={gesture.playbackId}
        width={96}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <GestureLink
          className="truncate font-medium text-body"
          href={href}
          linkComponent={linkComponent}
        >
          {gesture.name}
        </GestureLink>
        {categories ? (
          <span className="truncate text-body-sm text-foreground-muted">
            {categories}
          </span>
        ) : null}
      </div>
      {trailing ? (
        <div className="relative z-10 flex shrink-0 items-center">
          {trailing}
        </div>
      ) : null}
      {onFavoriteToggle ? (
        <FavoriteButton
          active={favorite}
          className="z-10"
          onToggle={onFavoriteToggle}
        />
      ) : null}
    </div>
  );
}
