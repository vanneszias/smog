import Check from "lucide-react-native/icons/check";
import Minus from "lucide-react-native/icons/minus";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
} from "react";
import { Pressable, type PressableProps, Text, View } from "react-native";
import { cn } from "../lib/cn";
import { useControllableState } from "../lib/controllable";
import { ICON_SIZE, textOf } from "../lib/icon";
import { useColor } from "../lib/theme";

type CheckedState = boolean | "indeterminate";

export interface CheckboxProps
  extends Omit<PressableProps, "children" | "style" | "onPress"> {
  checked?: CheckedState;
  className?: string;
  defaultChecked?: CheckedState;
  description?: ReactNode;
  invalid?: boolean;
  label?: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
  ref?: Ref<View>;
}

/** A 20 pt box in a 44 pt row; the whole row (label included) toggles it. */
export function Checkbox({
  accessibilityLabel,
  checked,
  className,
  defaultChecked = false,
  description,
  disabled: disabledProp,
  invalid = false,
  label,
  onCheckedChange,
  ...props
}: CheckboxProps): ReactElement {
  // PressableProps allow `null`.
  const disabled = disabledProp === true;
  const [state, setState] = useControllableState<CheckedState>(
    checked,
    defaultChecked,
    (next) => {
      onCheckedChange?.(next === true);
    }
  );
  const on = state === true;
  const mixed = state === "indeterminate";
  const markColor = useColor("primaryForeground");
  const toggle = useCallback((): void => {
    setState(!on);
  }, [on, setState]);
  return (
    <Pressable
      accessibilityHint={description ? textOf(description) : undefined}
      accessibilityLabel={accessibilityLabel ?? textOf(label)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: mixed ? "mixed" : on, disabled }}
      className={cn(
        "min-h-touch flex-row items-center gap-3",
        disabled && "opacity-50",
        className
      )}
      disabled={disabled}
      onPress={toggle}
      {...props}
    >
      <View
        className={cn(
          "size-5 items-center justify-center rounded-sm border-2",
          on || mixed ? "border-primary bg-primary" : "bg-surface",
          !(on || mixed) &&
            (invalid ? "border-danger" : "border-foreground-muted")
        )}
      >
        {on ? (
          <Check color={markColor} size={ICON_SIZE.sm} strokeWidth={3} />
        ) : null}
        {mixed ? (
          <Minus color={markColor} size={ICON_SIZE.sm} strokeWidth={3} />
        ) : null}
      </View>
      {label || description ? (
        <View className="flex-1 flex-col">
          {label ? (
            <Text className="text-body text-foreground">{label}</Text>
          ) : null}
          {description ? (
            <Text className="text-body-sm text-foreground-muted">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
