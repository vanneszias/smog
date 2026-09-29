import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  Pressable,
  type PressableProps,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { cn } from "../lib/cn";
import { useControllableState } from "../lib/controllable";
import { textOf } from "../lib/icon";

interface TabsState {
  setValue: (value: string) => void;
  value: string;
}

const TabsContext = createContext<TabsState | null>(null);

function useTabs(): TabsState {
  const state = useContext(TabsContext);
  if (!state) {
    throw new Error("[uiNative] Tabs parts must be inside <Tabs>");
  }
  return state;
}

export interface TabsProps {
  children?: ReactNode;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  value?: string;
}

/** Root: `value` / `defaultValue` / `onValueChange` (as Radix Tabs). */
export function Tabs({
  children,
  defaultValue = "",
  onValueChange,
  value,
}: TabsProps): ReactElement {
  const [current, setValue] = useControllableState(
    value,
    defaultValue,
    onValueChange
  );
  const state = useMemo(
    () => ({ setValue, value: current }),
    [current, setValue]
  );
  return <TabsContext.Provider value={state}>{children}</TabsContext.Provider>;
}

/** The row of tabs (`tablist`, named by `aria-label`), underline style. */
export function TabsList({ className, ...props }: ViewProps): ReactElement {
  return (
    <View
      accessibilityRole="tablist"
      className={cn("flex-row border-border-subtle border-b", className)}
      {...props}
    />
  );
}

export interface TabsTriggerProps
  extends Omit<PressableProps, "children" | "style"> {
  children?: ReactNode;
  className?: string;
  value: string;
}

export function TabsTrigger({
  children,
  className,
  disabled: disabledProp,
  value,
  ...props
}: TabsTriggerProps): ReactElement {
  // PressableProps allow `null`.
  const disabled = disabledProp === true;
  const { setValue, value: current } = useTabs();
  const selected = current === value;
  const choose = useCallback((): void => {
    setValue(value);
  }, [setValue, value]);
  return (
    <Pressable
      accessibilityLabel={textOf(children)}
      accessibilityRole="tab"
      accessibilityState={{ disabled, selected }}
      className={cn(
        "-mb-0.5 min-h-touch items-center justify-center border-b-2 px-4",
        selected ? "border-primary" : "border-transparent",
        disabled && "opacity-50",
        className
      )}
      disabled={disabled}
      onPress={choose}
      {...props}
    >
      <Text
        className={cn(
          "font-medium text-body-sm",
          selected ? "text-foreground" : "text-foreground-muted"
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export interface TabsContentProps extends ViewProps {
  value: string;
}

/** The panel of one tab; only the selected one renders. */
export function TabsContent({
  children,
  className,
  value,
  ...props
}: TabsContentProps): ReactElement | null {
  const tabs = useTabs();
  if (tabs.value !== value) {
    return null;
  }
  return (
    <View className={cn("pt-4", className)} {...props}>
      {typeof children === "string" ? (
        <Text className="text-body text-foreground">{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
