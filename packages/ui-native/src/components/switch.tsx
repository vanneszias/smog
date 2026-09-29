import {
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
} from "react";
import {
  Pressable,
  type PressableProps,
  Switch as RNSwitch,
  Text,
  View,
} from "react-native";
import { cn } from "../lib/cn";
import { useControllableState } from "../lib/controllable";
import { hapticToggle } from "../lib/haptics";
import { textOf } from "../lib/icon";
import { useColor } from "../lib/theme";

export interface SwitchProps
  extends Omit<PressableProps, "children" | "style" | "onPress"> {
  checked?: boolean;
  className?: string;
  defaultChecked?: boolean;
  description?: ReactNode;
  label?: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
  ref?: Ref<View>;
}

/**
 * The platform switch for settings that apply at once: label first, switch
 * trailing, the whole row one `switch` element that ticks on toggle.
 */
export function Switch({
  accessibilityLabel,
  checked,
  className,
  defaultChecked = false,
  description,
  disabled: disabledProp,
  label,
  onCheckedChange,
  ...props
}: SwitchProps): ReactElement {
  // PressableProps allow `null`.
  const disabled = disabledProp === true;
  const [on, setOn] = useControllableState(
    checked,
    defaultChecked,
    onCheckedChange
  );
  const trackOn = useColor("primary");
  const trackOff = useColor("border");
  const thumb = useColor("surface");
  const toggle = useCallback(
    (next: boolean): void => {
      hapticToggle();
      setOn(next);
    },
    [setOn]
  );
  const pressRow = useCallback((): void => {
    toggle(!on);
  }, [on, toggle]);
  return (
    <Pressable
      accessibilityHint={description ? textOf(description) : undefined}
      accessibilityLabel={accessibilityLabel ?? textOf(label)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      className={cn(
        "min-h-touch flex-row items-center gap-4",
        disabled && "opacity-50",
        className
      )}
      disabled={disabled}
      onPress={pressRow}
      {...props}
    >
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
      <RNSwitch
        accessibilityElementsHidden
        disabled={disabled}
        importantForAccessibility="no-hide-descendants"
        ios_backgroundColor={trackOff}
        onValueChange={toggle}
        thumbColor={thumb}
        trackColor={{ false: trackOff, true: trackOn }}
        value={on}
      />
    </Pressable>
  );
}
