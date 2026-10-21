import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing, transition } from "../lib/variants";

/**
 * Elevation 1 is a shadow in light mode; in dark mode it is a border and
 * `surface-raised` instead (spec §16; the dark `shadow-1` token is `none`).
 */
const cardVariants = cva(
  "flex flex-col gap-2 rounded-2xl p-4 text-card-foreground ring-1 ring-foreground/10 sm:p-6",
  {
    defaultVariants: { interactive: false, variant: "default" },
    variants: {
      interactive: {
        false: "",
        true: cn(
          "relative cursor-pointer hover:shadow-1 dark:hover:bg-popover dark:hover:ring-border",
          focusRing,
          transition
        ),
      },
      variant: {
        default: "bg-card shadow-0",
        raised: "bg-card shadow-1 dark:bg-popover dark:ring-border",
        sunken: "bg-muted shadow-0 ring-0",
      },
    },
  }
);

export interface CardProps
  extends ComponentProps<"div">,
    VariantProps<typeof cardVariants> {}

/** A content container: `default | raised | sunken`; `interactive` adds hover. */
export function Card({
  className,
  interactive,
  variant,
  ...props
}: CardProps): ReactNode {
  return (
    <div
      className={cn(cardVariants({ interactive, variant }), className)}
      data-slot="card"
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      data-slot="card-header"
      {...props}
    />
  );
}

export interface CardTitleProps extends ComponentProps<"h3"> {
  level?: 2 | 3 | 4;
}

export function CardTitle({
  className,
  level = 3,
  ...props
}: CardTitleProps): ReactNode {
  const Element = `h${level}` as const;
  return (
    <Element
      className={cn("font-semibold text-title-3", className)}
      data-slot="card-title"
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: ComponentProps<"p">): ReactNode {
  return (
    <p
      className={cn("text-body-sm text-muted-foreground", className)}
      data-slot="card-description"
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-slot="card-content"
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("mt-2 flex flex-wrap items-center gap-2", className)}
      data-slot="card-footer"
      {...props}
    />
  );
}

/** A control placed at the end of the header row (registry `CardAction`). */
export function CardAction({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("self-start justify-self-end", className)}
      data-slot="card-action"
      {...props}
    />
  );
}
