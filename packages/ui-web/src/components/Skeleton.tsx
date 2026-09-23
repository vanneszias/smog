import { cva } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * `bg-border-subtle` and not `bg-surface-raised`: in the light theme
 * `surfaceRaised` *is* white, so a skeleton painted with it is invisible on
 * the page it is meant to be standing in for. The subtle border colour is the
 * one token that reads as a quiet block against both themes' backgrounds.
 */
export const skeletonVariants = cva(
  "animate-pulse rounded-md bg-border-subtle"
);

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * A placeholder block.
 *
 * `aria-hidden` by default, because a pulsing rectangle has nothing to say: a
 * screen reader that walks into a dozen of them hears a dozen blank groups.
 * The loading state belongs on the region being replaced — `aria-busy` on the
 * list, or a status message — and `Skeleton` deliberately does not try to be
 * that. A caller who has a reason to expose one can, because props are spread
 * last and win.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      aria-hidden="true"
      className={cn(skeletonVariants(), className)}
      ref={ref}
      {...props}
    />
  )
);

Skeleton.displayName = "Skeleton";
