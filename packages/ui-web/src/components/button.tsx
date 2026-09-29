import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import {
  disabled,
  focusRing,
  hitArea,
  stateLayer,
  transition,
} from "../lib/variants";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium",
    stateLayer.md,
    focusRing,
    transition,
    disabled,
  ],
  {
    defaultVariants: { size: "md", variant: "primary" },
    variants: {
      size: {
        lg: "min-h-12 px-6 text-body",
        md: "min-h-touch px-4 text-body",
        // Dense admin tables only; the pseudo-element keeps a 44 px target.
        sm: cn("min-h-8 px-3 text-body-sm", hitArea),
      },
      variant: {
        danger: "border-transparent bg-danger text-primary-foreground",
        ghost: "border-transparent bg-transparent text-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-foreground-muted bg-surface text-foreground",
      },
    },
  }
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export interface ButtonProps
  extends ComponentProps<"button">,
    ButtonVariantProps {
  /** Web only: render the single child (a link) with the button styles. */
  asChild?: boolean;
  /** A leading icon (decorative; the children name the button). */
  icon?: ReactNode;
  /** Shows a spinner in place of the icon, sets `aria-busy` and disables it. */
  loading?: boolean;
}

/** The one button: `primary | secondary | ghost | danger` × `sm | md | lg`. */
export function Button({
  asChild = false,
  children,
  className,
  disabled: isDisabled,
  icon,
  loading = false,
  size,
  type,
  variant,
  ...props
}: ButtonProps): ReactNode {
  const classes = cn(buttonVariants({ size, variant }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  let leading: ReactNode = null;
  if (loading) {
    leading = <Spinner size={size === "lg" ? "md" : "sm"} />;
  } else if (icon) {
    leading = (
      <span
        aria-hidden="true"
        className="relative inline-flex shrink-0 *:size-5"
      >
        {icon}
      </span>
    );
  }
  return (
    <button
      aria-busy={loading || undefined}
      className={classes}
      disabled={isDisabled || loading}
      type={type ?? "button"}
      {...props}
    >
      {leading}
      {children}
    </button>
  );
}
