import { cn } from "@smog/ui-web";

/**
 * A piece of brand artwork from `public/brand/`, painted in the theme's
 * primary colour.
 *
 * The SVG is the mask, not the image: its shape cuts out a box filled with
 * `bg-primary`, so the artwork is green on the light theme and the lighter
 * green of `.dark` on the dark one without a second file. The artwork's own
 * fill (`currentColor`, black inside a mask) only decides what is opaque.
 *
 * Decorative by construction — `aria-hidden` and no text — so whatever
 * contains it names itself. The caller sets the size, including the aspect
 * ratio of the file's `viewBox`, since a mask has no intrinsic size.
 *
 * Both the standard and the `-webkit-` property, because Safari before 15.4
 * knows only the prefixed one and a missing mask paints a solid block.
 */
export function BrandArt({
  className,
  src,
}: {
  className?: string;
  src: string;
}) {
  const mask = `url(${src}) center / contain no-repeat`;

  return (
    <span
      aria-hidden="true"
      className={cn("block shrink-0 bg-primary", className)}
      style={{ mask, WebkitMask: mask }}
    />
  );
}
