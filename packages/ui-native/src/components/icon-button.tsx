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
  type View,
} from "react-native";
import { cn } from "../lib/cn";
import { hapticDanger } from "../lib/haptics";
import { ICON_SIZE, renderIcon } from "../lib/icon";
import { hitSlopFor, useColor } from "../lib/theme";
import { buttonVariants, CONTROL_HEIGHT, LABEL_ROLE } from "./button";
import { Spinner } from "./spinner";

const iconButtonVariants = cva("rounded-full px-0", {
  defaultVariants: { size: "md" },
  variants: {
    size: {
      lg: "size-12",
      md: "size-touch",
      sm: "size-8",
    },
  },
});

export interface IconButtonProps
  extends Omit<PressableProps, "children" | "style">,
    VariantProps<typeof iconButtonVariants> {
  className?: string;
  /** The icon element (lucide-react-native); colour and size are set for it. */
  icon: ReactNode;
  /** The accessible name (required: the icon has no text). */
  label: string;
  loading?: boolean;
  ref?: Ref<View>;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

/** A round, icon-only button; `label` is its accessible name. */
export function IconButton({
  accessibilityState,
  className,
  disabled = false,
  icon,
  label,
  loading = false,
  onPress,
  size,
  variant = "ghost",
  ...props
}: IconButtonProps): ReactElement {
  const resolvedSize = size ?? "md";
  const color = useColor(LABEL_ROLE[variant]);
  const inactive = disabled || loading;
  const handlePress = useCallback(
    (event: GestureResponderEvent): void => {
      if (variant === "danger") {
        hapticDanger();
      }
      onPress?.(event);
    },
    [onPress, variant]
  );
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        busy: loading,
        disabled: inactive,
      }}
      className={cn(
        buttonVariants({ variant }),
        iconButtonVariants({ size: resolvedSize }),
        "min-h-0",
        inactive && "opacity-50",
        className
      )}
      disabled={inactive}
      hitSlop={hitSlopFor(CONTROL_HEIGHT[resolvedSize])}
      onPress={handlePress}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" tone={LABEL_ROLE[variant]} />
      ) : (
        renderIcon(
          icon,
          color,
          resolvedSize === "sm" ? ICON_SIZE.sm : ICON_SIZE.md
        )
      )}
    </Pressable>
  );
}
