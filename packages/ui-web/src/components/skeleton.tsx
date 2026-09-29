import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

const skeletonVariants = cva(
  "animate-pulse bg-surface-sunken motion-reduce:animate-none dark:bg-border-subtle",
  {
    defaultVariants: { shape: "text" },
    variants: {
      shape: {
        circle: "size-10 rounded-full",
        rect: "h-16 w-full rounded-lg",
        text: "h-4 w-full rounded-sm",
      },
    },
  }
);

export interface SkeletonProps
  extends ComponentProps<"div">,
    VariantProps<typeof skeletonVariants> {}

/**
 * A loading placeholder (decorative). The data view around it announces the
 * loading state once (`aria-busy` on the region), not every placeholder.
 */
export function Skeleton({
  className,
  shape,
  ...props
}: SkeletonProps): ReactNode {
  return (
    <div
      aria-hidden="true"
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    />
  );
}
