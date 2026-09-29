import { type ColorRole, tokens } from "@smog/styles/tokens";
import type { ReactElement } from "react";
import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { useColor } from "../lib/theme";

/** Diameters in pt, as web's `size-4` / `size-5` / `size-6`. */
const SIZE = {
  lg: tokens.spacing["6"],
  md: tokens.spacing["5"],
  sm: tokens.spacing["4"],
} as const;

export interface SpinnerProps
  extends Omit<ActivityIndicatorProps, "size" | "color"> {
  size?: keyof typeof SIZE;
  /** The colour role (native has no `currentColor`); `primary` by default. */
  tone?: ColorRole;
}

/**
 * The platform activity indicator. Reserved for button loading (spec §16)
 * and decorative: the busy control announces the state.
 */
export function Spinner({
  size = "md",
  tone = "primary",
  ...props
}: SpinnerProps): ReactElement {
  const color = useColor(tone);
  return (
    <ActivityIndicator
      accessibilityElementsHidden
      color={color}
      importantForAccessibility="no-hide-descendants"
      // iOS draws only "small" and "large"; `lg` is the large one.
      size={SIZE[size] > SIZE.md ? "large" : "small"}
      {...props}
    />
  );
}
