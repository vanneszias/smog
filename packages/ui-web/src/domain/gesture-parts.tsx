import { handSvgs } from "@smog/brand/svg";
import { GESTURE_STILL_SECONDS, muxThumbnailUrl } from "@smog/utils";
import { Play } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { cn } from "../lib/cn";
import { GestureTitle } from "./gesture-title";
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
  "outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background";

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

/**
 * The still's own placeholder, under the image while it loads and in its
 * place when it fails: the deep green of the studio set with the video's
 * own title ("the hand points at the word", `GestureTitle`) when the frame
 * is large enough to read it, the pointing hand alone on a small one. Never
 * a blank tile or a lone letter.
 */
function StillFallback({ name }: { name?: string | undefined }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="@container absolute inset-0 bg-sidebar"
      data-slot="gesture-still-fallback"
    >
      {name ? (
        <GestureTitle drawn name={name} />
      ) : (
        <span
          className="absolute inset-x-[18%] top-1/2 inline-flex -translate-y-1/2 text-sidebar-foreground *:h-auto *:w-full"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: generated, trusted artwork from @smog/brand
          dangerouslySetInnerHTML={{ __html: handSvgs[1] }}
        />
      )}
    </span>
  );
}

/**
 * A decorative still (the name next to it is the text alternative), taken
 * one second in (`GESTURE_STILL_SECONDS`), over its branded placeholder.
 */
export function GestureThumbnail({
  className,
  name,
  playbackId,
  showPlay = false,
  width,
}: {
  className?: string;
  /** The gesture's name, drawn by the placeholder while there is no still. */
  name?: string;
  playbackId: string;
  /** A play glyph on the still: the card is a video (decorative). */
  showPlay?: boolean;
  /** Requested pixel width (about twice the rendered width). */
  width: number;
}): ReactNode {
  // A broken still with `alt=""` draws nothing, so the placeholder under it
  // shows even when the error fired before hydration; once React sees the
  // error, the image is dropped.
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  return (
    <div
      className={cn(
        "relative aspect-3/4 shrink-0 overflow-hidden bg-sidebar",
        className
      )}
    >
      <StillFallback name={name} />
      {failed ? null : (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: `error` is a load event, not an interaction; the still is decorative.
        <img
          alt=""
          className="relative size-full object-cover transition-transform duration-slow ease-enter group-hover/card:scale-105 motion-reduce:transition-none motion-reduce:group-hover/card:scale-100"
          decoding="async"
          height={Math.round((width * 4) / 3)}
          loading="lazy"
          onError={onError}
          src={muxThumbnailUrl(playbackId, {
            time: GESTURE_STILL_SECONDS,
            width,
          })}
          width={width}
        />
      )}
      {showPlay ? (
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-2 grid size-9 place-items-center rounded-full bg-highlight text-highlight-foreground shadow-1"
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
