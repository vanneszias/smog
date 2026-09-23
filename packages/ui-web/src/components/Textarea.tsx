import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import {
  CONTROL_BASE,
  CONTROL_INVALID,
  isAriaInvalid,
} from "../lib/controlBase";

/*
 * The sizes set a *minimum* height, not a height. A textarea grows with what
 * was typed into it, and `h-*` would clip it.
 */
export const textareaVariants = cva(`${CONTROL_BASE} py-2`, {
  variants: {
    size: {
      sm: "min-h-16 text-sm",
      md: "min-h-20 text-md",
      lg: "min-h-24 text-lg",
    },
    invalid: CONTROL_INVALID,
  },
  defaultVariants: { size: "md", invalid: false },
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  VariantProps<typeof textareaVariants>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { className, size, invalid, "aria-invalid": ariaInvalid, ...props },
    ref
  ) => {
    const isInvalid = invalid ?? isAriaInvalid(ariaInvalid);

    return (
      <textarea
        aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
        className={cn(
          textareaVariants({ size, invalid: isInvalid }),
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
