import { tokens } from "@smog/styles/tokens";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
} from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE, renderIcon } from "../lib/icon";
import { hitSlopFor, useColor } from "../lib/theme";

export interface SegmentedOption {
  disabled?: boolean;
  /** A leading decorative icon. */
  icon?: ReactNode;
  label: string;
  value: string;
}

export interface SegmentedControlProps extends ViewProps {
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: readonly SegmentedOption[];
  ref?: Ref<View>;
  size?: "sm" | "md";
  value: string;
}

const HEIGHT = { md: tokens.touchTarget, sm: tokens.spacing["8"] } as const;

/** A few mutually exclusive views; always has a value (a `radiogroup`). */
export function SegmentedControl({
  className,
  disabled = false,
  onValueChange,
  options,
  size = "md",
  value,
  ...props
}: SegmentedControlProps): ReactElement {
  const slop = hitSlopFor(HEIGHT[size]);
  return (
    <View
      accessibilityRole="radiogroup"
      className={cn(
        "flex-row gap-1 self-start rounded-md bg-surface-sunken p-0.5",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <Segment
          checked={option.value === value}
          disabled={disabled || option.disabled === true}
          key={option.value}
          onChoose={onValueChange}
          option={option}
          size={size}
          slop={slop}
        />
      ))}
    </View>
  );
}

function Segment({
  checked,
  disabled,
  onChoose,
  option,
  size,
  slop,
}: {
  checked: boolean;
  disabled: boolean;
  onChoose: (value: string) => void;
  option: SegmentedOption;
  size: "sm" | "md";
  slop: number;
}): ReactElement {
  const on = useColor("foreground");
  const off = useColor("foregroundMuted");
  const choose = useCallback((): void => {
    if (!checked) {
      onChoose(option.value);
    }
  }, [checked, onChoose, option.value]);
  return (
    <Pressable
      accessibilityLabel={option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      className={cn(
        "flex-row items-center justify-center gap-2 rounded-sm px-3",
        size === "md" ? "min-h-touch" : "min-h-8",
        checked ? "bg-surface" : "bg-transparent",
        disabled && "opacity-50"
      )}
      disabled={disabled}
      // Vertical only: neighbours' targets never overlap.
      hitSlop={slop > 0 ? { bottom: slop, top: slop } : undefined}
      onPress={choose}
    >
      {renderIcon(option.icon, checked ? on : off, ICON_SIZE.sm)}
      <Text
        className={cn(
          "font-medium",
          size === "md" ? "text-body-sm" : "text-caption",
          checked ? "text-foreground" : "text-foreground-muted"
        )}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}
