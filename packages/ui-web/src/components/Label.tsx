import { Root as LabelPrimitive } from "@radix-ui/react-label";
import { cva } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * A label bound to a control, following the shape set by `Button`.
 *
 * Radix's Label is a plain `<label>` plus one behaviour: it suppresses the
 * text selection a double click on a label otherwise produces. Everything
 * else — `htmlFor`, the implicit association when the control is nested —
 * is the platform's.
 *
 * Exported as `labelVariants` so a consumer can style a `<legend>` or a table
 * header identically without reaching for the component.
 */
export const labelVariants = cva(
  "inline-flex select-none items-center gap-2 font-medium text-foreground text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
);

export type LabelProps = ComponentPropsWithoutRef<typeof LabelPrimitive>;

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <LabelPrimitive
      className={cn(labelVariants(), className)}
      ref={ref}
      {...props}
    />
  )
);

Label.displayName = "Label";
