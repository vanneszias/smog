import { cva, type VariantProps } from "class-variance-authority";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
} from "react";
import {
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewProps,
} from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE, renderIcon, textOf } from "../lib/icon";
import { createOverlay } from "../lib/overlay";
import { useColor } from "../lib/theme";
import { SheetPanel } from "./sheet-panel";

const overlay = createOverlay("Menu");

/** Root: `open` / `defaultOpen` / `onOpenChange`. */
export const Menu = overlay.Root;
/** Wraps one pressable child that opens the menu (web: `asChild`). */
export const MenuTrigger = overlay.Trigger;

export interface MenuContentProps extends ViewProps {
  /** Web's dropdown placement; the native action sheet ignores it. */
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

/** The menu's items, in an action sheet (a bottom sheet with a `menu` role). */
export function MenuContent({
  align: _align,
  children,
  className,
  sideOffset: _sideOffset,
  testID,
  ...props
}: MenuContentProps): ReactElement {
  const { close, open } = overlay.useOverlay();
  return (
    <SheetPanel className="px-2" onClose={close} open={open}>
      <View
        accessibilityRole="menu"
        className={cn("flex-col", className)}
        testID={testID}
        {...props}
      >
        {children}
      </View>
    </SheetPanel>
  );
}

const menuItemVariants = cva(
  "min-h-touch flex-row items-center gap-3 rounded-md px-4",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        danger: "active:bg-danger-subtle",
        default: "active:bg-surface-sunken",
      },
    },
  }
);

export interface MenuItemProps
  extends Omit<PressableProps, "children" | "style">,
    VariantProps<typeof menuItemVariants> {
  children?: ReactNode;
  className?: string;
  /** A leading decorative icon. */
  icon?: ReactNode;
  /** Runs the action; the menu closes afterwards. */
  onSelect?: () => void;
  ref?: Ref<View>;
}

export function MenuItem({
  children,
  className,
  disabled: disabledProp,
  icon,
  onPress,
  onSelect,
  variant,
  ...props
}: MenuItemProps): ReactElement {
  // PressableProps allow `null`.
  const disabled = disabledProp === true;
  const { close } = overlay.useOverlay();
  const danger = variant === "danger";
  const color = useColor(danger ? "dangerStrong" : "foreground");
  const handlePress = useCallback(
    (event: GestureResponderEvent): void => {
      onPress?.(event);
      onSelect?.();
      close();
    },
    [close, onPress, onSelect]
  );
  return (
    <Pressable
      accessibilityLabel={textOf(children)}
      accessibilityRole="menuitem"
      accessibilityState={{ disabled }}
      className={cn(
        menuItemVariants({ variant }),
        disabled && "opacity-50",
        className
      )}
      disabled={disabled}
      onPress={handlePress}
      {...props}
    >
      {renderIcon(icon, color, ICON_SIZE.md)}
      <Text
        className={cn(
          "flex-1 text-body",
          danger ? "text-danger-strong" : "text-foreground"
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function MenuLabel({ className, ...props }: TextProps): ReactElement {
  return (
    <Text
      className={cn(
        "px-4 py-2 font-medium text-caption text-foreground-muted",
        className
      )}
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: ViewProps): ReactElement {
  return (
    <View
      accessibilityElementsHidden
      className={cn("my-1 bg-border-subtle", className)}
      importantForAccessibility="no-hide-descendants"
      style={styles.separator}
      {...props}
    />
  );
}

export function MenuGroup({ className, ...props }: ViewProps): ReactElement {
  return <View className={cn("flex-col", className)} {...props} />;
}

// One device pixel, as web's `h-px`.
const styles = StyleSheet.create({
  separator: { height: StyleSheet.hairlineWidth },
});
