import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { fieldVariants } from "../lib/variants";
import { useFieldControl } from "./field";

export interface TextareaProps extends ComponentProps<"textarea"> {
  invalid?: boolean;
}

/** A multi-line text field; inside a Field it is labelled automatically. */
export function Textarea({
  className,
  rows,
  ...rest
}: TextareaProps): ReactNode {
  const { invalid: _invalid, ...props } = useFieldControl(rest);
  return (
    <textarea
      className={cn(fieldVariants({ size: "md" }), "py-3", className)}
      rows={rows ?? 4}
      {...props}
    />
  );
}
