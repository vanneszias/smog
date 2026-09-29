import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing, transition } from "../lib/variants";

/**
 * Elevation 1 is a shadow in light mode; in dark mode it is a border and
 * `surface-raised` instead (spec §16; the dark `shadow-1` token is `none`).
 */
const cardVariants = cva(
  "flex flex-col gap-2 rounded-lg border p-4 text-foreground sm:p-6",
  {
    defaultVariants: { interactive: false, variant: "default" },
    variants: {
      interactive: {
        false: "",
        true: cn(
          "relative cursor-pointer hover:shadow-1 dark:hover:border-border dark:hover:bg-surface-raised",
          focusRing,
          transition
        ),
      },
      variant: {
        default: "border-border-subtle bg-surface shadow-0",
        raised:
          "border-transparent bg-surface shadow-1 dark:border-border dark:bg-surface-raised",
        sunken: "border-transparent bg-surface-sunken shadow-0",
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
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
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
      className={cn("text-body-sm text-foreground-muted", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("mt-2 flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}
