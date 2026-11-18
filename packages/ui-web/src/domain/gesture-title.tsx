import { handSvgs } from "@smog/brand/svg";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cn } from "../lib/cn";

/*
 * "The hand points at the word": the title every gesture video opens with,
 * drawn by the kit so a textless video, a gesture without a still and the
 * burned-in title all look the same. The values are measured from the
 * existing videos (3:4 frame, the studio teal set; overlaid on a burned-in
 * clip they cover it within a few pixels), relative to the frame's width
 * (`cqw`): the pointing hand starts 6 % in and is 23 % wide, its centre
 * 3.5 % lower than the name's; the name starts 30 % in, in Figtree Regular,
 * white, 10.7 % of the frame's width (a cap height of about 6.7 %), its
 * centre 20.7 % down the frame. A long word steps the size down so it
 * never runs out of the frame (`titleFontSize`). The mobile kit mirrors
 * these numbers (DESIGN.md, "Video player").
 */

const WORDS = /\s+/u;

/** Share of the frame's width the name may take (from 30 % in to the 6 % right inset). */
const NAME_WIDTH_CQW = 64;
/** Figtree's average advance per character, in em (measured on Dutch names). */
const CHAR_EM = 0.55;
/** The burned-in title's size: 10.7 % of the frame's width. */
const MAX_CQW = 10.7;

/** The name's size: 10.7 cqw, or less so its longest word fits on one line. */
export function titleFontSize(name: string): string {
  const longest = Math.max(
    1,
    ...name.split(WORDS).map((word) => [...word].length)
  );
  const fit = NAME_WIDTH_CQW / (longest * CHAR_EM);
  return `${Math.min(MAX_CQW, Math.round(fit * 100) / 100)}cqw`;
}

export interface GestureTitleProps
  extends Omit<ComponentProps<"span">, "children"> {
  /**
   * Draws the name with CSS (`content: attr(data-name)`), so it is no text
   * of the page: for a picture whose name is already written next to it
   * (a gesture card's still), where it must not be found or read twice.
   */
  drawn?: boolean;
  name: string;
}

/**
 * The pointing hand and the name, positioned over a frame. The parent is
 * the frame's box (`absolute inset-0` inside it, or the frame itself) and
 * must be a size container (`@container`), so every length follows the
 * frame. Decorative by itself: callers hide it from assistive technology
 * where the name is already said.
 */
export function GestureTitle({
  className,
  drawn = false,
  name,
  style,
  ...props
}: GestureTitleProps): ReactNode {
  const titleStyle: CSSProperties = {
    fontSize: titleFontSize(name),
    ...style,
  };
  return (
    <span
      className={cn(
        "absolute inset-x-[6cqw] top-[20.7%] flex -translate-y-1/2 items-center gap-[0.5cqw] font-normal text-white leading-[1.05] tracking-[-0.01em]",
        className
      )}
      data-slot="gesture-title"
      style={titleStyle}
      {...props}
    >
      <span
        aria-hidden="true"
        className="mt-[7cqw] inline-flex w-[23cqw] shrink-0 *:h-auto *:w-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: generated, trusted artwork from @smog/brand
        dangerouslySetInnerHTML={{ __html: handSvgs[1] }}
        data-slot="gesture-title-hand"
      />
      {drawn ? (
        <span
          className="min-w-0 text-balance break-words before:content-[attr(data-name)]"
          data-name={name}
        />
      ) : (
        <span className="min-w-0 text-balance break-words">{name}</span>
      )}
    </span>
  );
}
