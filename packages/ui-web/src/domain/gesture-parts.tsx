import { muxThumbnailUrl } from "@smog/utils";
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
  width,
}: {
  className?: string;
  playbackId: string;
  /** Requested pixel width (about twice the rendered width). */
  width: number;
}): ReactNode {
  return (
    <div
      className={cn(
        "aspect-3/4 shrink-0 overflow-hidden bg-surface-sunken",
        className
      )}
    >
      <img
        alt=""
        className="size-full object-cover"
        decoding="async"
        height={Math.round((width * 4) / 3)}
        loading="lazy"
        src={muxThumbnailUrl(playbackId, { width })}
        width={width}
      />
    </div>
  );
}

/** "Greetings, Everyday". */
export function categoryLine(categories: readonly CategoryRef[]): string {
  return categories.map((category) => category.name).join(", ");
}
