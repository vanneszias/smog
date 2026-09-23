import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { Text } from "./Text";

/**
 * The native twin of `packages/ui-web/src/components/Badge.tsx`. A label,
 * not a control — nothing here is pressable, so the neutral and outline
 * variants' edges are the only borders involved, same reasoning as
 * `Button`'s secondary and outline variants: the neutral badge sits on an
 * already-tinted surface (`border-subtle`), the outline badge has nothing
 * but its edge (`border-strong`).
 */
export const badgeVariants = cva(
  "flex-row items-center gap-xs self-start rounded-full",
  {
    variants: {
      variant: {
        neutral: "border border-border-subtle bg-surface",
        primary: "bg-primary",
        success: "bg-success",
        warning: "bg-warning",
        danger: "bg-danger",
        outline: "border border-border-strong bg-transparent",
      },
      size: {
        sm: "px-sm py-0",
        md: "px-md py-xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  }
);

const labelVariants = cva("font-medium", {
  variants: {
    variant: {
      neutral: "text-foreground",
      primary: "text-primary-foreground",
      success: "text-success-foreground",
      warning: "text-warning-foreground",
      danger: "text-danger-foreground",
      outline: "text-foreground",
    },
    size: { sm: "text-xs", md: "text-sm" },
  },
  defaultVariants: { variant: "neutral", size: "md" },
});

export type BadgeProps = ViewProps &
  VariantProps<typeof badgeVariants> & {
    children?: ReactNode;
    className?: string;
  };

export function Badge({
  children,
  className,
  size,
  testID = "root",
  variant,
  ...props
}: BadgeProps) {
  return (
    <View
      className={cn(badgeVariants({ size, variant }), className)}
      testID={testID}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className={labelVariants({ size, variant })} testID="label">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
