import { handSvgs } from "@smog/brand/svg";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

export type HandIndex = 0 | 1 | 2;

export interface HandIllustrationProps
  extends Omit<ComponentProps<"span">, "children"> {
  /** Which of the three brand hands (`handSvgs`); the first by default. */
  hand?: HandIndex;
}

/**
 * One of the brand's hand drawings (from `@smog/brand/svg`), the motif of
 * empty states, errors, the 404 and the auth side panels. Decorative
 * (`aria-hidden`), drawn in `currentColor`: set the colour with a text
 * class, the height with a height class (`h-16` by default).
 */
export function HandIllustration({
  className,
  hand = 0,
  ...props
}: HandIllustrationProps): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-16 shrink-0 text-primary *:h-full *:w-auto",
        className
      )}
      data-hand={hand}
      data-slot="hand-illustration"
      {...props}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated, trusted artwork from @smog/brand
      dangerouslySetInnerHTML={{ __html: handSvgs[hand] }}
    />
  );
}
