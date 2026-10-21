import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, ReactNode, Ref } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE, renderIcon } from "../lib/icon";
import { useColor } from "../lib/theme";
import { Text } from "./text";

const alertVariants = cva("flex-row items-start gap-3 rounded-lg border p-4", {
  defaultVariants: { variant: "default" },
  variants: {
    variant: {
      default: "border-border bg-card",
      destructive: "border-destructive bg-danger-subtle",
    },
  },
});

export interface AlertProps
  extends Omit<ViewProps, "children">,
    VariantProps<typeof alertVariants> {
  children?: ReactNode;
  className?: string;
  /** A leading icon (decorative). */
  icon?: ReactNode;
  ref?: Ref<View>;
}

/**
 * An inline message (Reusables' `Alert`): `AlertTitle` and `AlertDescription`
 * inside. A polite live region; `destructive` is an `alert` (assertive).
 */
export function Alert({
  children,
  className,
  icon,
  variant,
  ...props
}: AlertProps): ReactElement {
  const destructive = variant === "destructive";
  const color = useColor(destructive ? "dangerStrong" : "foreground");
  return (
    <View
      accessibilityLiveRegion={destructive ? "assertive" : "polite"}
      accessibilityRole="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {icon ? (
        <View className="mt-0.5">{renderIcon(icon, color, ICON_SIZE.md)}</View>
      ) : null}
      <View className="min-w-0 flex-1 flex-col gap-1">{children}</View>
    </View>
  );
}

export interface AlertTextProps {
  children?: ReactNode;
  className?: string;
  testID?: string;
}

export function AlertTitle({
  children,
  className,
  testID,
}: AlertTextProps): ReactElement {
  return (
    <Text className={className} testID={testID} weight="medium">
      {children}
    </Text>
  );
}

export function AlertDescription({
  children,
  className,
  testID,
}: AlertTextProps): ReactElement {
  return (
    <Text className={className} size="body-sm" testID={testID} tone="muted">
      {children}
    </Text>
  );
}
