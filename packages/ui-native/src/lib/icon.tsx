import { tokens } from "@smog/styles/tokens";
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { View } from "react-native";

/** The props the kit sets on an icon element (lucide-react-native's). */
interface IconElementProps {
  color?: string;
  size?: number;
}

/** Icon sizes in pt: the web kit's `size-4` / `size-5` / `size-6`. */
export const ICON_SIZE = {
  lg: tokens.spacing["6"],
  md: tokens.spacing["5"],
  sm: tokens.spacing["4"],
} as const;

/**
 * Native has no `currentColor`: the kit gives an icon element the colour of
 * the text next to it and a size, unless the caller already set them. The
 * icon is decorative (the control's label names it).
 */
export function renderIcon(
  icon: ReactNode,
  color: string,
  size: number = ICON_SIZE.md
): ReactNode {
  if (!icon) {
    return null;
  }
  const element = isValidElement<IconElementProps>(icon)
    ? cloneElement(icon as ReactElement<IconElementProps>, {
        color: icon.props.color ?? color,
        size: icon.props.size ?? size,
      })
    : icon;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {element}
    </View>
  );
}

/** The plain text of a node, for accessibility labels built from children. */
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}
