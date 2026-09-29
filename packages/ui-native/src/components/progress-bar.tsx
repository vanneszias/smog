import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, Ref } from "react";
import { View, type ViewProps } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { cn } from "../lib/cn";

const fillVariants = cva("h-full rounded-full", {
  defaultVariants: { tone: "primary" },
  variants: {
    tone: {
      danger: "bg-danger",
      primary: "bg-primary",
      success: "bg-success",
      warning: "bg-warning",
    },
  },
});

export interface ProgressBarProps
  extends Omit<ViewProps, "children">,
    VariantProps<typeof fillVariants> {
  /** The accessible name (required). */
  label: string;
  max?: number;
  ref?: Ref<View>;
  /** Omit for indeterminate progress. */
  value?: number;
}

const DEFAULT_MAX = 100;

/** A `progressbar`; indeterminate without `value` (a pulse, none under reduced motion). */
export function ProgressBar({
  className,
  label,
  max = DEFAULT_MAX,
  tone,
  value,
  ...props
}: ProgressBarProps): ReactElement {
  const reducedMotion = useReducedMotion();
  const indeterminate = value === undefined;
  const percent = indeterminate
    ? 0
    : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={
        indeterminate ? { max, min: 0 } : { max, min: 0, now: value }
      }
      accessible
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-surface-sunken",
        className
      )}
      {...props}
    >
      <View
        className={cn(
          fillVariants({ tone }),
          indeterminate && "w-1/3",
          indeterminate && !reducedMotion && "animate-pulse"
        )}
        style={indeterminate ? undefined : { width: `${percent}%` }}
      />
    </View>
  );
}
