import { type ReactElement, type Ref, useCallback } from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { useControllableState } from "../lib/controllable";
import { useFieldControl } from "./field";

export interface RadioOption {
  description?: string;
  disabled?: boolean;
  label: string;
  value: string;
}

export interface RadioGroupProps extends ViewProps {
  defaultValue?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  options: readonly RadioOption[];
  orientation?: "vertical" | "horizontal";
  ref?: Ref<View>;
  value?: string;
}

/** One choice out of a few; inside a Field it is named by the Field label. */
export function RadioGroup({
  accessibilityLabel,
  "aria-label": ariaLabel,
  className,
  defaultValue,
  disabled = false,
  onValueChange,
  options,
  orientation = "vertical",
  value,
  ...props
}: RadioGroupProps): ReactElement {
  const field = useFieldControl({
    accessibilityLabel: accessibilityLabel ?? ariaLabel,
  });
  const [selected, setSelected] = useControllableState<string>(
    value,
    defaultValue,
    onValueChange
  );
  return (
    <View
      accessibilityLabel={field.accessibilityLabel}
      accessibilityRole="radiogroup"
      className={cn(
        orientation === "horizontal" ? "flex-row flex-wrap gap-4" : "flex-col",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <Radio
          checked={option.value === selected}
          disabled={disabled || option.disabled === true}
          key={option.value}
          onSelect={setSelected}
          option={option}
        />
      ))}
    </View>
  );
}

function Radio({
  checked,
  disabled,
  onSelect,
  option,
}: {
  checked: boolean;
  disabled: boolean;
  onSelect: (value: string) => void;
  option: RadioOption;
}): ReactElement {
  const select = useCallback((): void => {
    onSelect(option.value);
  }, [onSelect, option.value]);
  return (
    <Pressable
      accessibilityHint={option.description}
      accessibilityLabel={option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      className={cn(
        "min-h-touch flex-row items-center gap-3",
        disabled && "opacity-50"
      )}
      disabled={disabled}
      onPress={select}
    >
      <View
        className={cn(
          "size-5 items-center justify-center rounded-full border-2",
          checked ? "border-primary" : "border-foreground-muted"
        )}
      >
        {checked ? <View className="size-2 rounded-full bg-primary" /> : null}
      </View>
      <View className="flex-col">
        <Text className="text-body text-foreground">{option.label}</Text>
        {option.description ? (
          <Text className="text-body-sm text-foreground-muted">
            {option.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
