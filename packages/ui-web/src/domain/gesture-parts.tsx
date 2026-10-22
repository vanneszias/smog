import { muxThumbnailUrl } from "@smog/utils";
import { Play } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import type { CategoryRef, KitLinkComponent, KitLinkProps } from "./types";

/*
 * Parts GestureCard and GestureRow share: the Mux still and the stretched
 * link (one tab stop whose target covers the whole card or row).
 */

function PlainLink({ children, className, href }: KitLinkProps): ReactNode {
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

/**
 * The link's pseudo-element covers its nearest positioned ancestor (the
 * card or row), and carries the focus ring there.
 */
const stretchedLink =
  "outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-focus-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background";

export function GestureLink({
  children,
  className,
  href,
  linkComponent,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  linkComponent?: KitLinkComponent;
}): ReactNode {
  if (href === undefined) {
    return <span className={className}>{children}</span>;
  }
  const Link = linkComponent ?? PlainLink;
  return (
    <Link className={cn(stretchedLink, className)} href={href}>
      {children}
    </Link>
  );
}

/** A decorative still (the name next to it is the text alternative). */
export function GestureThumbnail({
  className,
  playbackId,
  showPlay = false,
  width,
}: {
  className?: string;
  playbackId: string;
  /** A play glyph on the still: the card is a video (decorative). */
  showPlay?: boolean;
  /** Requested pixel width (about twice the rendered width). */
  width: number;
}): ReactNode {
  return (
    <div
      className={cn(
        "relative aspect-3/4 shrink-0 overflow-hidden bg-muted",
        className
      )}
    >
      <img
        alt=""
        className="size-full object-cover transition-transform duration-300 group-hover/card:scale-105 motion-reduce:transition-none motion-reduce:group-hover/card:scale-100"
        decoding="async"
        height={Math.round((width * 4) / 3)}
        loading="lazy"
        src={muxThumbnailUrl(playbackId, { width })}
        width={width}
      />
      {showPlay ? (
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-2 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-1"
          data-slot="gesture-play"
        >
          <Play className="size-4 fill-current" />
        </span>
      ) : null}
    </div>
  );
}

/** "Greetings, Everyday". */
export function categoryLine(categories: readonly CategoryRef[]): string {
  return categories.map((category) => category.name).join(", ");
}
