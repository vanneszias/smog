import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

/*
 * The registry `empty` parts (ui.shadcn.com, radix-maia), with the kit's
 * type scale and a heading level on the title. `EmptyState` composes them
 * with the kit's copy; screens may compose them directly.
 */

export function Empty({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-4 text-balance rounded-4xl p-6 text-center md:p-12",
        className
      )}
      data-slot="empty"
      {...props}
    />
  );
}

export function EmptyHeader({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("flex max-w-sm flex-col items-center gap-2", className)}
      data-slot="empty-header"
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "size-12 rounded-full bg-accent text-accent-foreground [&_svg:not([class*='size-'])]:size-6",
      },
    },
  }
);

export function EmptyMedia({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>): ReactNode {
  return (
    <div
      className={cn(emptyMediaVariants({ variant }), className)}
      data-slot="empty-icon"
      data-variant={variant}
      {...props}
    />
  );
}

export interface EmptyTitleProps extends ComponentProps<"h3"> {
  /** Heading level (3 by default); 1 for a page-level state. */
  level?: 1 | 2 | 3 | 4;
}

export function EmptyTitle({
  className,
  level = 3,
  ...props
}: EmptyTitleProps): ReactNode {
  const Heading = `h${level}` as const;
  return (
    <Heading
      className={cn(
        "font-semibold text-foreground tracking-tight",
        level === 1 ? "text-title-1" : "text-title-3",
        className
      )}
      data-slot="empty-title"
      {...props}
    />
  );
}

export function EmptyDescription({
  className,
  ...props
}: ComponentProps<"p">): ReactNode {
  return (
    <p
      className={cn(
        "text-body text-muted-foreground [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      data-slot="empty-description"
      {...props}
    />
  );
}

export function EmptyContent({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "mt-2 flex w-full min-w-0 max-w-sm flex-wrap items-center justify-center gap-2 text-balance",
        className
      )}
      data-slot="empty-content"
      {...props}
    />
  );
}
