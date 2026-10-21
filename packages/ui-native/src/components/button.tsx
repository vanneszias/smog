import { type ColorRole, tokens } from "@smog/styles/tokens";
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
  Text,
  type View,
} from "react-native";
import { cn } from "../lib/cn";
import { hapticDanger } from "../lib/haptics";
import { ICON_SIZE, renderIcon } from "../lib/icon";
import { hitSlopFor, useColor } from "../lib/theme";
import { Spinner } from "./spinner";
import { type SurfaceTone, surfaceRoles, useSurface } from "./surface";

export const buttonVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-md border active:opacity-80",
  {
    defaultVariants: { size: "md", variant: "primary" },
    variants: {
      size: {
        lg: "min-h-12 px-6",
        md: "min-h-touch px-4",
        // Dense admin UI only; hitSlop keeps a 44 pt target.
        sm: "min-h-8 px-3",
      },
      variant: {
        danger: "border-transparent bg-destructive",
        ghost: "border-transparent bg-transparent",
        primary: "border-transparent bg-primary",
        secondary: "border-muted-foreground bg-card",
      },
    },
  }
);

const buttonLabelVariants = cva("font-medium", {
  defaultVariants: { size: "md", variant: "primary" },
  variants: {
    size: { lg: "text-body", md: "text-body", sm: "text-body-sm" },
    variant: {
      danger: "text-primary-foreground",
      ghost: "text-foreground",
      primary: "text-primary-foreground",
      secondary: "text-foreground",
    },
  },
});

type ButtonVariantProps = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<ButtonVariantProps["variant"]>;
export type ButtonSize = NonNullable<ButtonVariantProps["size"]>;

/** The colour of the label, for the icon and spinner next to it. */
const LABEL_ROLE: Record<ButtonVariant, ColorRole> = {
  danger: "primaryForeground",
  ghost: "foreground",
  primary: "primaryForeground",
  secondary: "foreground",
};

interface ButtonColours {
  /** Classes added to the container (they win over the variant's). */
  container: string;
  /** Classes added to the label (the variant's own on the page). */
  label: string;
  /** The label's colour as a role (icons, spinners). */
  role: ColorRole;
}

/**
 * Buttons on a green `Surface`: the primary action is the orange highlight
 * (green on green would vanish), the others are white. The danger variant
 * keeps its own colours.
 */
function onSurface(
  tone: SurfaceTone,
  variant: ButtonVariant
): ButtonColours | undefined {
  if (tone === "default" || variant === "danger") {
    return;
  }
  if (variant === "primary") {
    return {
      container: "bg-highlight",
      label: "text-highlight-foreground",
      role: "highlightForeground",
    };
  }
  const roles = surfaceRoles(tone);
  let container = "";
  if (variant === "secondary") {
    container =
      tone === "header"
        ? "border-sidebar-foreground bg-transparent"
        : "border-primary-foreground bg-transparent";
  }
  return { container, label: roles.foregroundClass, role: roles.foreground };
}

/**
 * The container and label classes and the label role of a variant on the
 * current surface (the variant's own on the page).
 */
export function useButtonColours(variant: ButtonVariant): ButtonColours {
  const surface = onSurface(useSurface(), variant);
  return surface ?? { container: "", label: "", role: LABEL_ROLE[variant] };
}

/** Control heights in pt, for the hitSlop of the small size. */
export const CONTROL_HEIGHT: Record<ButtonSize, number> = {
  lg: tokens.spacing["12"],
  md: tokens.touchTarget,
  sm: tokens.spacing["8"],
};

export interface ButtonProps
  extends Omit<PressableProps, "children" | "style">,
    ButtonVariantProps {
  children?: ReactNode;
  className?: string;
  /** A leading icon (decorative; the children name the button). */
  icon?: ReactNode;
  /** Shows a spinner in place of the icon, marks it busy and disables it. */
  loading?: boolean;
  ref?: Ref<View>;
}

/** The one button: `primary | secondary | ghost | danger` × `sm | md | lg`. */
export function Button({
  accessibilityState,
  children,
  className,
  disabled = false,
  icon,
  loading = false,
  onPress,
  size,
  variant,
  ...props
}: ButtonProps): ReactElement {
  const resolvedSize = size ?? "md";
  const resolvedVariant = variant ?? "primary";
  const colours = useButtonColours(resolvedVariant);
  const labelRole = colours.role;
  const labelColor = useColor(labelRole);
  const inactive = disabled || loading;
  const handlePress = useCallback(
    (event: GestureResponderEvent): void => {
      if (resolvedVariant === "danger") {
        hapticDanger();
      }
      onPress?.(event);
    },
    [onPress, resolvedVariant]
  );
  let leading: ReactNode = null;
  if (loading) {
    leading = (
      <Spinner size={resolvedSize === "lg" ? "md" : "sm"} tone={labelRole} />
    );
  } else if (icon) {
    leading = renderIcon(icon, labelColor, ICON_SIZE.md);
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        busy: loading,
        disabled: inactive,
      }}
      className={cn(
        buttonVariants({ size: resolvedSize, variant: resolvedVariant }),
        colours.container,
        inactive && "opacity-50",
        className
      )}
      disabled={inactive}
      hitSlop={hitSlopFor(CONTROL_HEIGHT[resolvedSize])}
      onPress={handlePress}
      {...props}
    >
      {leading}
      {typeof children === "string" || typeof children === "number" ? (
        <Text
          className={cn(
            buttonLabelVariants({
              size: resolvedSize,
              variant: resolvedVariant,
            }),
            colours.label
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
