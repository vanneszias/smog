import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
} from "react-native";
import { cn } from "../lib/cn";
import { Text } from "./Text";

/**
 * The reference component for this package, and the native counterpart of
 * `packages/ui-web/src/components/Button.tsx`. Every other component here
 * copies this shape:
 *
 * - a `cva` config exported so the vocabulary test can interrogate it;
 * - `cn(variants, className)` with `className` LAST, so a caller's class
 *   wins the merge;
 * - `{...props}` spread after the props this component sets.
 *
 * Two things differ from web, and both are platform facts rather than
 * choices. There is no `asChild`: React Native has no element to slot into
 * and navigation is a prop on `Pressable`, not a wrapping anchor. And the
 * label is wrapped in this package's `Text` rather than accepted raw,
 * because a bare string inside a `Pressable` throws on Android.
 *
 * `accessibilityRole="button"` is set rather than inferred. `Pressable`
 * reports no role by default, so without it every button in the app is an
 * unlabelled view to a screen reader — a failure that is invisible to
 * everyone who does not use one.
 */
export const buttonVariants = cva(
  "flex-row items-center justify-center gap-sm rounded-md",
  {
    variants: {
      variant: {
        primary: "bg-primary",
        secondary: "border border-border bg-surface",
        outline: "border border-border-strong bg-transparent",
        ghost: "bg-transparent",
        danger: "bg-danger",
      },
      size: {
        sm: "h-8 px-md",
        md: "h-10 px-lg",
        lg: "h-12 px-xl",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

const labelVariants = cva("font-medium", {
  variants: {
    variant: {
      primary: "text-primary-foreground",
      secondary: "text-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      danger: "text-danger-foreground",
    },
    size: { sm: "text-sm", md: "text-md", lg: "text-lg", icon: "text-md" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export type ButtonProps = Omit<PressableProps, "children" | "style"> &
  VariantProps<typeof buttonVariants> & {
    children: ReactNode;
    /** Shows a spinner, marks the control busy and blocks interaction. */
    loading?: boolean;
    className?: string;
  };

export function Button({
  children,
  className,
  disabled,
  loading = false,
  size,
  variant,
  ...props
}: ButtonProps) {
  const blocked = disabled === true || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: blocked }}
      className={cn(
        buttonVariants({ size, variant }),
        blocked && "opacity-50",
        className
      )}
      disabled={blocked}
      {...props}
    >
      {loading ? <ActivityIndicator accessibilityElementsHidden /> : null}
      {typeof children === "string" ? (
        <Text className={labelVariants({ size, variant })}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
