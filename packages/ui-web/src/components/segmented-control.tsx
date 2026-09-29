import { cva, type VariantProps } from "class-variance-authority";
import { ToggleGroup } from "radix-ui";
import { type ReactNode, useCallback } from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, hitAreaY, transition } from "../lib/variants";

export interface SegmentedOption {
  disabled?: boolean;
  /** A decorative leading icon. */
  icon?: ReactNode;
  label: string;
  value: string;
}

const segmentVariants = cva(
  [
    "inline-flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-sm px-3 font-medium text-foreground-muted",
    "hover:text-foreground data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-1 dark:data-[state=on]:bg-surface-raised",
    focusRing,
    transition,
    disabled,
  ],
  {
    defaultVariants: { size: "md" },
    variants: {
      size: {
        md: "min-h-touch text-body-sm",
        // Segments sit 4 px apart: a vertical-only hit area avoids overlap.
        sm: cn("min-h-8 text-caption", hitAreaY),
      },
    },
  }
);

export interface SegmentedControlProps
  extends VariantProps<typeof segmentVariants> {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: readonly SegmentedOption[];
  ref?: React.Ref<HTMLDivElement>;
  value: string;
}

/**
 * A compact single choice between 2–4 views (grid/list). Always has a value:
 * clicking the selected segment keeps it.
 */
export function SegmentedControl({
  className,
  disabled: isDisabled,
  onValueChange,
  options,
  size,
  value,
  ...props
}: SegmentedControlProps): ReactNode {
  const handleValueChange = useCallback(
    (next: string): void => {
      // Radix reports "" when the selected item is pressed again.
      if (next) {
        onValueChange(next);
      }
    },
    [onValueChange]
  );
  return (
    <ToggleGroup.Root
      className={cn(
        "inline-flex w-full gap-1 rounded-md bg-surface-sunken p-1 sm:w-auto sm:self-start",
        className
      )}
      disabled={isDisabled}
      onValueChange={handleValueChange}
      type="single"
      value={value}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          className={segmentVariants({ size })}
          disabled={option.disabled}
          key={option.value}
          value={option.value}
        >
          {option.icon ? (
            <span aria-hidden="true" className="inline-flex *:size-4">
              {option.icon}
            </span>
          ) : null}
          <span className="truncate">{option.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
