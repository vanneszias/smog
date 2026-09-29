import { cva, type VariantProps } from "class-variance-authority";
import { Progress } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

const fillVariants = cva(
  "h-full w-full rounded-full transition-transform duration-normal ease-standard motion-reduce:transition-none",
  {
    defaultVariants: { tone: "primary" },
    variants: {
      tone: {
        danger: "bg-danger",
        primary: "bg-primary",
        success: "bg-success",
        warning: "bg-warning",
      },
    },
  }
);

export interface ProgressBarProps
  extends Omit<ComponentProps<typeof Progress.Root>, "children" | "value">,
    VariantProps<typeof fillVariants> {
  /** The accessible name (what is progressing). */
  label: string;
  max?: number;
  /** Omit for an indeterminate bar. */
  value?: number | null;
}

/** Determinate or indeterminate progress (uploads, renders). */
export function ProgressBar({
  className,
  label,
  max = 100,
  tone,
  value,
  ...props
}: ProgressBarProps): ReactNode {
  const determinate = typeof value === "number";
  const percent = determinate
    ? Math.min(100, Math.max(0, (value / max) * 100))
    : 0;
  return (
    <Progress.Root
      aria-label={label}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-surface-sunken dark:bg-border-subtle",
        className
      )}
      max={max}
      value={determinate ? value : null}
      {...props}
    >
      <Progress.Indicator
        className={cn(
          fillVariants({ tone }),
          !determinate && "w-2/5 animate-progress motion-reduce:animate-none"
        )}
        style={
          determinate
            ? { transform: `translateX(-${100 - percent}%)` }
            : undefined
        }
      />
    </Progress.Root>
  );
}
