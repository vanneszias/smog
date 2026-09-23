import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * A label, not a control. Nothing here is clickable, so the neutral and
 * outline variants' edges are the only borders involved: the neutral badge's
 * edge is decoration on an already-tinted surface (`border-subtle`), while the
 * outline badge has nothing *but* its edge, so that one is `border-strong`.
 * Same reasoning as `Button`'s secondary and outline variants.
 *
 * The status colours pair a brand hue with near-black text, which is the
 * pairing `@smog/styles` asserts at AA — a badge is read as a label, not as
 * an action.
 */
export const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full font-medium",
  {
    variants: {
      variant: {
        neutral: "border border-border-subtle bg-surface text-foreground",
        primary: "bg-primary text-primary-foreground",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        danger: "bg-danger text-danger-foreground",
        outline: "border border-border-strong bg-transparent text-foreground",
      },
      size: {
        sm: "px-2 py-0 text-xs",
        md: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  }
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  )
);

Badge.displayName = "Badge";
