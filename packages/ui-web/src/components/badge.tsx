import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

/** Status text uses `*-strong` on its `*-subtle` tint (DECISIONS, contrast pairs). */
export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium",
  {
    defaultVariants: { size: "sm", variant: "neutral" },
    variants: {
      size: {
        md: "px-3 py-1 text-body-sm",
        sm: "px-2 py-0.5 text-caption",
      },
      variant: {
        accent: "bg-accent text-accent-foreground",
        danger: "bg-danger-subtle text-danger-strong",
        neutral: "bg-surface-sunken text-foreground",
        primary: "bg-primary-subtle text-primary-strong",
        success: "bg-success-subtle text-success-strong",
        warning: "bg-warning-subtle text-warning-strong",
      },
    },
  }
);

export interface BadgeProps
  extends ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  /** A leading decorative icon. */
  icon?: ReactNode;
}

/** A small, non-interactive label: `neutral | primary | accent | success | warning | danger`. */
export function Badge({
  children,
  className,
  icon,
  size,
  variant,
  ...props
}: BadgeProps): ReactNode {
  return (
    <span
      className={cn(badgeVariants({ size, variant }), className)}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex *:size-3">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
