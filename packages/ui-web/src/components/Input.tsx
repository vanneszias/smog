import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import {
  CONTROL_BASE,
  CONTROL_INVALID,
  isAriaInvalid,
} from "../lib/controlBase";

export const inputVariants = cva(CONTROL_BASE, {
  variants: {
    size: {
      sm: "h-8 text-sm",
      md: "h-10 text-md",
      lg: "h-12 text-lg",
    },
    invalid: CONTROL_INVALID,
  },
  defaultVariants: { size: "md", invalid: false },
});

/*
 * `size` is a native `<input>` attribute typed as a number, so the variant of
 * the same name has to displace it or the two intersect to `never` and every
 * call site fails to typecheck. The character-count `size` attribute has no
 * use in this design system; `style` and `className` cover what it was for.
 */
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> &
  VariantProps<typeof inputVariants>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, size, invalid, "aria-invalid": ariaInvalid, ...props },
    ref
  ) => {
    const isInvalid = invalid ?? isAriaInvalid(ariaInvalid);

    return (
      <input
        aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
        className={cn(inputVariants({ size, invalid: isInvalid }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
