import type { ColorRole } from "@smog/styles/tokens";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, ReactNode, Ref } from "react";
import { Text, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE, renderIcon } from "../lib/icon";
import { useColor } from "../lib/theme";

/** Status text uses `*-strong` on its `*-subtle` tint (DECISIONS, contrast pairs). */
export const badgeVariants = cva(
  "flex-row items-center gap-1 self-start rounded-full",
  {
    defaultVariants: { size: "sm", variant: "neutral" },
    variants: {
      size: {
        md: "px-3 py-1",
        sm: "px-2 py-0.5",
      },
      variant: {
        accent: "bg-accent",
        danger: "bg-danger-subtle",
        neutral: "bg-surface-sunken",
        primary: "bg-primary-subtle",
        success: "bg-success-subtle",
        warning: "bg-warning-subtle",
      },
    },
  }
);

const badgeLabelVariants = cva("font-medium", {
  defaultVariants: { size: "sm", variant: "neutral" },
  variants: {
    size: { md: "text-body-sm", sm: "text-caption" },
    variant: {
      accent: "text-accent-foreground",
      danger: "text-danger-strong",
      neutral: "text-foreground",
      primary: "text-primary-strong",
      success: "text-success-strong",
      warning: "text-warning-strong",
    },
  },
});

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const LABEL_ROLE: Record<BadgeVariant, ColorRole> = {
  accent: "accentForeground",
  danger: "dangerStrong",
  neutral: "foreground",
  primary: "primaryStrong",
  success: "successStrong",
  warning: "warningStrong",
};

export interface BadgeProps
  extends ViewProps,
    VariantProps<typeof badgeVariants> {
  children?: ReactNode;
  /** A leading decorative icon. */
  icon?: ReactNode;
  ref?: Ref<View>;
}

/** A small, non-interactive label: `neutral | primary | accent | success | warning | danger`. */
export function Badge({
  children,
  className,
  icon,
  size,
  variant,
  ...props
}: BadgeProps): ReactElement {
  const color = useColor(LABEL_ROLE[variant ?? "neutral"]);
  return (
    <View
      className={cn(badgeVariants({ size, variant }), className)}
      {...props}
    >
      {renderIcon(icon, color, ICON_SIZE.sm)}
      <Text className={badgeLabelVariants({ size, variant })}>{children}</Text>
    </View>
  );
}
