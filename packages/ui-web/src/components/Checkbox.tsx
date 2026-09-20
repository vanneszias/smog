import {
  Indicator as CheckboxIndicator,
  Root as CheckboxRoot,
} from "@radix-ui/react-checkbox";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, Minus } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * Border role: a checkbox that is not ticked is nothing but its edge, so that
 * edge is the functional `border` (3:1), never the decorative
 * `border-subtle`.
 */
export const checkboxVariants = cva(
  "peer inline-flex shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary",
  {
    variants: {
      size: {
        sm: "size-4",
        md: "size-5",
        lg: "size-6",
      },
    },
    defaultVariants: { size: "md" },
  }
);

export type CheckboxProps = ComponentPropsWithoutRef<typeof CheckboxRoot> &
  VariantProps<typeof checkboxVariants>;

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, size, ...props }, ref) => (
    <CheckboxRoot
      className={cn(checkboxVariants({ size }), className)}
      ref={ref}
      {...props}
    >
      {/*
       * Radix mounts the indicator for `checked` and for `indeterminate`
       * alike and offers no way to branch on which, so the two icons are both
       * rendered and the indicator's own `data-state` picks one. A tick on a
       * `mixed` checkbox would say "all of them", which is the opposite of
       * what mixed means.
       */}
      <CheckboxIndicator className="group/indicator flex items-center justify-center">
        <Check
          aria-hidden="true"
          className="size-full group-data-[state=indeterminate]/indicator:hidden"
          data-icon="check"
        />
        <Minus
          aria-hidden="true"
          className="size-full group-data-[state=checked]/indicator:hidden"
          data-icon="indeterminate"
        />
      </CheckboxIndicator>
    </CheckboxRoot>
  )
);

Checkbox.displayName = "Checkbox";
