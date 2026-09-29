import type { ReactElement, ReactNode, Ref } from "react";
import {
  type GestureResponderEvent,
  Pressable,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { cn } from "../lib/cn";

const rowClasses = "min-h-touch w-full flex-row items-center gap-3 px-4 py-3";

export interface ListItemProps extends Omit<ViewProps, "children"> {
  description?: ReactNode;
  disabled?: boolean;
  /** Leading media (an icon, Avatar or thumbnail). */
  leading?: ReactNode;
  /** Makes the row a button (web: `onClick`). */
  onPress?: (event: GestureResponderEvent) => void;
  ref?: Ref<View>;
  title: ReactNode;
  /** Trailing content (a Badge, a chevron, an IconButton). */
  trailing?: ReactNode;
}

/** One row of a list: leading media, a title, a description and trailing content. */
export function ListItem({
  className,
  description,
  disabled = false,
  leading,
  onPress,
  title,
  trailing,
  ...props
}: ListItemProps): ReactElement {
  const content = (
    <>
      {leading ? (
        <View className="shrink-0 flex-row items-center">{leading}</View>
      ) : null}
      <View className="min-w-0 flex-1 flex-col">
        <Text
          className="font-medium text-body text-foreground"
          numberOfLines={1}
        >
          {title}
        </Text>
        {description ? (
          <Text
            className="text-body-sm text-foreground-muted"
            numberOfLines={1}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <View className="shrink-0 flex-row items-center gap-2">{trailing}</View>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={cn(
          rowClasses,
          "active:bg-surface-sunken",
          disabled && "opacity-50",
          className
        )}
        disabled={disabled}
        onPress={onPress}
        {...props}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View className={cn(rowClasses, className)} {...props}>
      {content}
    </View>
  );
}
