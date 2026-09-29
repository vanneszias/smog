import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { type FieldVariantProps, fieldVariants } from "../lib/variants";
import { useFieldControl } from "./field";

export interface InputProps
  extends Omit<ComponentProps<"input">, "size">,
    FieldVariantProps {
  invalid?: boolean;
  /** A leading decorative icon inside the field. */
  leading?: ReactNode;
  /** Trailing content inside the field (e.g. a show-password IconButton). */
  trailing?: ReactNode;
}

/** A single-line text field (`md | lg`); inside a Field it is labelled automatically. */
export function Input({
  className,
  leading,
  size,
  trailing,
  type,
  ...rest
}: InputProps): ReactNode {
  const { invalid: _invalid, ...props } = useFieldControl(rest);
  const input = (
    <input
      className={cn(
        fieldVariants({ size }),
        leading && "pl-10",
        trailing && "pr-12",
        className
      )}
      type={type ?? "text"}
      {...props}
    />
  );
  if (!(leading || trailing)) {
    return input;
  }
  return (
    <div className="relative flex w-full items-center">
      {leading ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 inline-flex text-foreground-muted *:size-5"
        >
          {leading}
        </span>
      ) : null}
      {input}
      {trailing ? (
        <span className="absolute right-0 inline-flex">{trailing}</span>
      ) : null}
    </div>
  );
}
