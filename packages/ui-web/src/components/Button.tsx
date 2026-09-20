import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * The reference component for this package. Every other component copies this
 * shape:
 *
 * - a `cva` config holding the base classes and every variant, exported so a
 *   consumer can style a different element identically;
 * - a forwarded `ref`, so the element is reachable for focus and measurement;
 * - `cn(variants, className)` with `className` LAST, so a caller's class wins
 *   the merge rather than the cascade;
 * - `{...props}` spread onto the element after the props this component sets,
 *   so anything not named here passes straight through.
 *
 * Borders follow the three roles in `@smog/styles`: a button's edge is what
 * tells you where the control is, so it is `border-border` (functional, 3:1)
 * and `border-border-strong` for the outline variant that has nothing else to
 * delimit it. `border-border-subtle` is decoration and has no business here.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border border-border bg-surface text-foreground hover:bg-surface-raised",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:bg-surface",
        ghost: "bg-transparent text-foreground hover:bg-surface",
        danger: "bg-danger text-danger-foreground hover:bg-danger/90",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-md",
        lg: "h-12 px-6 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child element instead of a `<button>`. */
    asChild?: boolean;
    /** Shows a spinner, marks the control busy and blocks interaction. */
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      type,
      children,
      ...props
    },
    ref
  ) => {
    const Component = asChild ? Slot : "button";

    return (
      <Component
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        ref={ref}
        /*
         * `type="button"` by default, and an explicit `type` still wins.
         *
         * HTML defaults a button inside a form to `submit`, which makes the
         * failure silent and destructive: pressing Enter in a field submits
         * the form through the first submit-shaped control it finds, which is
         * how a "clear" button ends up erasing what was just typed. The
         * opposite mistake — a real submit button that does nothing until
         * someone writes `type="submit"` — is visible the first time it is
         * pressed and breaks nothing.
         *
         * Only when this renders a real <button>. With `asChild` the element
         * is the caller's — usually an <a> — and `type` is not a valid
         * attribute there, so the default is not forced onto it.
         */
        type={asChild ? type : (type ?? "button")}
        {...props}
      >
        {loading ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {/*
         * `Slottable` marks which child the slot replaces. Without it a
         * loading `asChild` button hands Slot two children and Radix throws,
         * which is the kind of combination nobody tries until production.
         */}
        <Slottable>{children}</Slottable>
      </Component>
    );
  }
);

Button.displayName = "Button";
