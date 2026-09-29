import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, ReactNode, Ref } from "react";
import {
  type GestureResponderEvent,
  Pressable,
  type View as RNView,
  type StyleProp,
  Text,
  type TextProps,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { cn } from "../lib/cn";
import { useShadow, useThemeName } from "../lib/theme";

/**
 * Elevation 1 is a shadow in light mode; in dark mode it is a border and
 * `surface-raised` instead (spec §16; the dark elevation-1 shadow is none).
 */
const cardVariants = cva("flex-col gap-2 rounded-lg border p-4", {
  compoundVariants: [
    {
      className: "border-border bg-surface-raised",
      dark: true,
      variant: "raised",
    },
  ],
  defaultVariants: { variant: "default" },
  variants: {
    dark: { false: "", true: "" },
    variant: {
      default: "border-border-subtle bg-surface",
      raised: "border-transparent bg-surface",
      sunken: "border-transparent bg-surface-sunken",
    },
  },
});

export interface CardProps
  extends Omit<ViewProps, "style">,
    VariantProps<typeof cardVariants> {
  children?: ReactNode;
  /** Web's hover elevation; native shows a pressed state when `onPress` is set. */
  interactive?: boolean;
  /** Makes the whole card a button (name it with `accessibilityLabel`). */
  onPress?: (event: GestureResponderEvent) => void;
  ref?: Ref<RNView>;
  style?: StyleProp<ViewStyle>;
}

/** A content container: `default | raised | sunken`; `onPress` makes it a button. */
export function Card({
  className,
  interactive: _interactive,
  onPress,
  style,
  variant,
  ...props
}: CardProps): ReactElement {
  const theme = useThemeName();
  const shadow = useShadow(variant === "raised" ? "1" : "0");
  const classes = cn(
    cardVariants({ dark: theme === "dark", variant }),
    className
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        className={cn(classes, "active:opacity-80")}
        onPress={onPress}
        style={[shadow, style]}
        {...props}
      />
    );
  }
  return <View className={classes} style={[shadow, style]} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps): ReactElement {
  return <View className={cn("flex-col gap-1", className)} {...props} />;
}

export interface CardTitleProps extends TextProps {
  /** Web's outline level; native has one `header` role. */
  level?: 2 | 3 | 4;
}

export function CardTitle({
  className,
  level: _level,
  ...props
}: CardTitleProps): ReactElement {
  return (
    <Text
      accessibilityRole="header"
      className={cn("font-semibold text-foreground text-title-3", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: TextProps): ReactElement {
  return (
    <Text
      className={cn("text-body-sm text-foreground-muted", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ViewProps): ReactElement {
  return <View className={cn("flex-col gap-2", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps): ReactElement {
  return (
    <View
      className={cn("mt-2 flex-row flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}
