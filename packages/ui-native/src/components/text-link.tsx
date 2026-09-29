import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, Ref } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "../lib/cn";

const textLinkVariants = cva("font-medium", {
  defaultVariants: { tone: "primary" },
  variants: {
    tone: {
      default: "text-foreground",
      muted: "text-foreground-muted",
      primary: "text-primary-strong",
    },
  },
});

export interface TextLinkProps
  extends Omit<RNTextProps, "onPress">,
    VariantProps<typeof textLinkVariants> {
  onPress: NonNullable<RNTextProps["onPress"]>;
  ref?: Ref<RNText>;
}

/**
 * A link in or next to text (web `TextLink`): a pressable `Text` with
 * `accessibilityRole="link"`, a 44 pt target (vertical padding) and an
 * underline while pressed. Navigate in `onPress`.
 */
export function TextLink({
  className,
  tone,
  ...props
}: TextLinkProps): ReactElement {
  return (
    <RNText
      accessibilityRole="link"
      className={cn(
        textLinkVariants({ tone }),
        // 12 pt above and below a body line: a 44 pt target. RN `Text` has
        // no `hitSlop`, and a link nested in a sentence ignores padding, so
        // give links their own line where the target matters.
        "py-3 active:underline",
        className
      )}
      suppressHighlighting
      {...props}
    />
  );
}
