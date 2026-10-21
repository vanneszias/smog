import { cva, type VariantProps } from "class-variance-authority";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { cn } from "../lib/cn";
import { useControllableState } from "../lib/controllable";
import { hapticToggle } from "../lib/haptics";
import { ICON_SIZE, renderIcon } from "../lib/icon";
import { hitSlopFor, useColor } from "../lib/theme";

const toggleVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-md border active:opacity-80",
  {
    defaultVariants: { size: "md", variant: "default" },
    variants: {
      size: {
        lg: "min-h-12 px-5",
        md: "min-h-touch px-4",
        sm: "min-h-8 px-3",
      },
      variant: {
        default: "border-transparent",
        outline: "border-input",
      },
    },
  }
);

type ToggleVariantProps = VariantProps<typeof toggleVariants>;
type ToggleSize = NonNullable<ToggleVariantProps["size"]>;

const HEIGHT: Record<ToggleSize, number> = { lg: 48, md: 44, sm: 32 };

export interface ToggleProps
  extends Omit<PressableProps, "children" | "style">,
    ToggleVariantProps {
  children?: ReactNode;
  className?: string;
  /** Uncontrolled start state. */
  defaultPressed?: boolean;
  /** A leading icon (decorative; the children name the toggle). */
  icon?: ReactNode;
  onPressedChange?: (pressed: boolean) => void;
  /** Controlled state. */
  pressed?: boolean;
  ref?: Ref<View>;
}

/**
 * A two-state button (Reusables' `Toggle`): `togglebutton` with
 * `accessibilityState.checked`, a light tick on change. `pressed` /
 * `defaultPressed` / `onPressedChange` as Radix.
 */
export function Toggle({
  accessibilityState,
  children,
  className,
  defaultPressed = false,
  disabled: disabledProp,
  icon,
  onPress,
  onPressedChange,
  pressed: pressedProp,
  size,
  variant,
  ...props
}: ToggleProps): ReactElement {
  const disabled = disabledProp === true;
  const resolvedSize = size ?? "md";
  const [pressed, setPressed] = useControllableState(
    pressedProp,
    defaultPressed,
    onPressedChange
  );
  const color = useColor(pressed ? "accentForeground" : "mutedForeground");
  const handlePress = useCallback(
    (event: GestureResponderEvent): void => {
      onPress?.(event);
      hapticToggle();
      setPressed(!pressed);
    },
    [onPress, pressed, setPressed]
  );
  return (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityState={{ ...accessibilityState, checked: pressed, disabled }}
      className={cn(
        toggleVariants({ size: resolvedSize, variant }),
        pressed && "bg-accent",
        disabled && "opacity-50",
        className
      )}
      disabled={disabled}
      hitSlop={hitSlopFor(HEIGHT[resolvedSize])}
      onPress={handlePress}
      {...props}
    >
      {renderIcon(icon, color, ICON_SIZE.md)}
      {typeof children === "string" || typeof children === "number" ? (
        <Text
          className={cn(
            "font-medium text-body-sm",
            pressed ? "text-accent-foreground" : "text-muted-foreground"
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

interface GroupState {
  isPressed: (value: string) => boolean;
  size: ToggleVariantProps["size"];
  toggle: (value: string) => void;
  variant: ToggleVariantProps["variant"];
}

const GroupContext = createContext<GroupState | null>(null);

interface ToggleGroupBaseProps
  extends Omit<ViewProps, "children">,
    ToggleVariantProps {
  children?: ReactNode;
  className?: string;
  ref?: Ref<View>;
}

export type ToggleGroupProps = ToggleGroupBaseProps &
  (
    | {
        type?: "single";
        defaultValue?: string;
        onValueChange?: (value: string) => void;
        value?: string;
      }
    | {
        type: "multiple";
        defaultValue?: string[];
        onValueChange?: (value: string[]) => void;
        value?: string[];
      }
  );

function toList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return value === "" ? [] : [value];
}

/**
 * Toggles that share a value (Reusables' `ToggleGroup`): `type="single"`
 * (default; `""` is none) or `"multiple"`. `size` and `variant` apply to
 * every `ToggleGroupItem`.
 */
export function ToggleGroup(props: ToggleGroupProps): ReactElement {
  const {
    children,
    className,
    defaultValue,
    onValueChange,
    size,
    type,
    value,
    variant,
    ...viewProps
  } = props;
  const multiple = type === "multiple";
  const [open, setOpen] = useControllableState<string[]>(
    toList(value),
    toList(defaultValue) ?? [],
    (next) => {
      if (multiple) {
        (onValueChange as ((v: string[]) => void) | undefined)?.(next);
      } else {
        (onValueChange as ((v: string) => void) | undefined)?.(next[0] ?? "");
      }
    }
  );
  const toggle = useCallback(
    (item: string): void => {
      const isOn = open.includes(item);
      if (multiple) {
        setOpen(isOn ? open.filter((v) => v !== item) : [...open, item]);
      } else {
        setOpen(isOn ? [] : [item]);
      }
    },
    [multiple, open, setOpen]
  );
  const state = useMemo<GroupState>(
    () => ({
      isPressed: (item) => open.includes(item),
      size,
      toggle,
      variant,
    }),
    [open, size, toggle, variant]
  );
  return (
    <GroupContext.Provider value={state}>
      <View
        accessibilityRole="toolbar"
        className={cn("flex-row items-center gap-1", className)}
        {...viewProps}
      >
        {children}
      </View>
    </GroupContext.Provider>
  );
}

export interface ToggleGroupItemProps
  extends Omit<ToggleProps, "defaultPressed" | "onPressedChange" | "pressed"> {
  value: string;
}

/** One toggle of a `ToggleGroup`. */
export function ToggleGroupItem({
  onPress,
  value,
  ...props
}: ToggleGroupItemProps): ReactElement {
  const group = useContext(GroupContext);
  if (!group) {
    throw new Error("[uiNative] ToggleGroupItem must be inside <ToggleGroup>");
  }
  const handlePress = useCallback(
    (event: GestureResponderEvent): void => {
      onPress?.(event);
      group.toggle(value);
    },
    [group, onPress, value]
  );
  return (
    <Toggle
      {...props}
      onPress={handlePress}
      pressed={group.isPressed(value)}
      size={props.size ?? group.size}
      variant={props.variant ?? group.variant}
    />
  );
}
