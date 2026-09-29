import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

const spinnerVariants = cva(
  "shrink-0 animate-spin motion-reduce:animate-none",
  {
    defaultVariants: { size: "md" },
    variants: {
      size: {
        lg: "size-8",
        md: "size-5",
        sm: "size-4",
      },
    },
  }
);

export interface SpinnerProps
  extends Omit<ComponentProps<"svg">, "children">,
    VariantProps<typeof spinnerVariants> {}

/**
 * Reserved for button loading (spec §16): decorative, the button carries
 * `aria-busy`. Data views use Skeleton instead.
 */
export function Spinner({
  className,
  size,
  ...props
}: SpinnerProps): ReactNode {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn(spinnerVariants({ size }), className)}
      data-slot="spinner"
      {...props}
    />
  );
}
