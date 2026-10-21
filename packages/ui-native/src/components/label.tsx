import type { ReactElement, Ref } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "../lib/cn";
import { surfaceRoles, useSurface } from "./surface";

export interface LabelProps extends RNTextProps {
  className?: string;
  /** Dims the label next to a disabled control. */
  disabled?: boolean;
  ref?: Ref<RNText>;
}

/**
 * A label for a control that is not wrapped in a `Field` (Reusables' `Label`).
 * Name the control with `accessibilityLabel` or `accessibilityLabelledBy`
 * (`nativeID` here); `Field` does both for you.
 */
export function Label({
  className,
  disabled = false,
  ...props
}: LabelProps): ReactElement {
  const roles = surfaceRoles(useSurface());
  return (
    <RNText
      className={cn(
        "font-medium text-body-sm",
        roles.foregroundClass,
        disabled && "opacity-50",
        className
      )}
      {...props}
    />
  );
}
