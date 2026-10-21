import ChevronDown from "lucide-react-native/icons/chevron-down";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { Pressable, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { useControllableState } from "../lib/controllable";
import { ICON_SIZE } from "../lib/icon";
import { useColor } from "../lib/theme";
import { Text } from "./text";

interface AccordionState {
  /** Stable while the open items are the same. */
  isOpen: (value: string) => boolean;
  toggle: (value: string) => void;
}

const AccordionContext = createContext<AccordionState | null>(null);
const ItemContext = createContext<string | null>(null);

function useAccordion(): AccordionState {
  const state = useContext(AccordionContext);
  if (!state) {
    throw new Error("[uiNative] Accordion parts must be inside <Accordion>");
  }
  return state;
}

function useItemValue(): string {
  const value = useContext(ItemContext);
  if (value === null) {
    throw new Error(
      "[uiNative] AccordionTrigger and AccordionContent need an AccordionItem"
    );
  }
  return value;
}

/** `""` (a single accordion with nothing open) is no item. */
function toList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return value === "" ? [] : [value];
}

interface AccordionBaseProps extends Omit<ViewProps, "children"> {
  children?: ReactNode;
  className?: string;
  ref?: Ref<View>;
}

export type AccordionProps = AccordionBaseProps &
  (
    | {
        /** One item open at a time; `""` is none. */
        type?: "single";
        /** Whether the open item can be closed again (default true). */
        collapsible?: boolean;
        defaultValue?: string;
        onValueChange?: (value: string) => void;
        value?: string;
      }
    | {
        /** Any number of items open. */
        type: "multiple";
        collapsible?: never;
        defaultValue?: string[];
        onValueChange?: (value: string[]) => void;
        value?: string[];
      }
  );

/**
 * Collapsible sections (Reusables' `Accordion`): `AccordionItem` (`value`)
 * with an `AccordionTrigger` and an `AccordionContent`. `type="single"`
 * (default) keeps one open, `"multiple"` any number; `value` /
 * `defaultValue` / `onValueChange` as Radix.
 */
export function Accordion(props: AccordionProps): ReactElement {
  const { children, className, ...rest } = props;
  const multiple = props.type === "multiple";
  const collapsible =
    props.type === "multiple" ? true : (props.collapsible ?? true);
  const [open, setOpen] = useControllableState<string[]>(
    toList(props.value),
    toList(props.defaultValue) ?? [],
    (next) => {
      if (props.type === "multiple") {
        props.onValueChange?.(next);
      } else {
        props.onValueChange?.(next[0] ?? "");
      }
    }
  );
  const toggle = useCallback(
    (value: string): void => {
      const isOpen = open.includes(value);
      if (multiple) {
        setOpen(isOpen ? open.filter((v) => v !== value) : [...open, value]);
      } else if (!isOpen) {
        setOpen([value]);
      } else if (collapsible) {
        setOpen([]);
      }
    },
    [collapsible, multiple, open, setOpen]
  );
  const state = useMemo<AccordionState>(
    () => ({ isOpen: (value) => open.includes(value), toggle }),
    [open, toggle]
  );
  // The union's own props are not View props.
  const {
    collapsible: _collapsible,
    defaultValue: _defaultValue,
    onValueChange: _onValueChange,
    type: _type,
    value: _value,
    ...viewProps
  } = rest;
  return (
    <AccordionContext.Provider value={state}>
      <View className={cn("w-full", className)} {...viewProps}>
        {children}
      </View>
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps extends Omit<ViewProps, "children"> {
  children?: ReactNode;
  className?: string;
  ref?: Ref<View>;
  value: string;
}

export function AccordionItem({
  children,
  className,
  value,
  ...props
}: AccordionItemProps): ReactElement {
  return (
    <ItemContext.Provider value={value}>
      <View className={cn("border-border border-b", className)} {...props}>
        {children}
      </View>
    </ItemContext.Provider>
  );
}

export interface AccordionTriggerProps {
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  testID?: string;
}

/** The row that opens and closes its item; `expanded` is its state. */
export function AccordionTrigger({
  children,
  className,
  disabled = false,
  testID,
}: AccordionTriggerProps): ReactElement {
  const { isOpen, toggle } = useAccordion();
  const value = useItemValue();
  const open = isOpen(value);
  const color = useColor("mutedForeground");
  const press = useCallback((): void => toggle(value), [toggle, value]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded: open }}
      className={cn(
        "min-h-touch flex-row items-center justify-between gap-4 py-3 active:opacity-70",
        disabled && "opacity-50",
        className
      )}
      disabled={disabled}
      onPress={press}
      testID={testID}
    >
      {typeof children === "string" ? (
        <Text className="flex-1" weight="medium">
          {children}
        </Text>
      ) : (
        children
      )}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // A style, not `rotate-180`: Tailwind's transforms go through
        // variables, which css-interop remounts a view for.
        style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
      >
        <ChevronDown color={color} size={ICON_SIZE.md} />
      </View>
    </Pressable>
  );
}

export interface AccordionContentProps extends Omit<ViewProps, "children"> {
  children?: ReactNode;
  className?: string;
  ref?: Ref<View>;
}

/** The item's body; not rendered while the item is closed. */
export function AccordionContent({
  children,
  className,
  ...props
}: AccordionContentProps): ReactElement | null {
  const { isOpen } = useAccordion();
  if (!isOpen(useItemValue())) {
    return null;
  }
  return (
    <View className={cn("flex-col gap-2 pb-4", className)} {...props}>
      {typeof children === "string" ? (
        <Text tone="muted">{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
