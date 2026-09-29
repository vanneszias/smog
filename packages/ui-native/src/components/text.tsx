import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, Ref } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "../lib/cn";
import { toneText } from "../lib/theme";

const textVariants = cva("", {
  defaultVariants: { size: "body", tone: "default", weight: "regular" },
  variants: {
    size: {
      body: "text-body",
      "body-sm": "text-body-sm",
      caption: "text-caption",
    },
    tone: toneText,
    weight: {
      medium: "font-medium",
      regular: "font-regular",
      semibold: "font-semibold",
    },
  },
});

export interface TextProps
  extends RNTextProps,
    VariantProps<typeof textVariants> {
  ref?: Ref<RNText>;
}

/** Body copy: `body | body-sm | caption`, a tone and a weight. Web's `as` has no native counterpart. */
export function Text({
  className,
  size,
  tone,
  weight,
  ...props
}: TextProps): ReactElement {
  return (
    <RNText
      className={cn(textVariants({ size, tone, weight }), className)}
      {...props}
    />
  );
}

const headingVariants = cva("font-semibold", {
  variants: {
    size: {
      display: "text-display",
      "title-1": "text-title-1",
      "title-2": "text-title-2",
      "title-3": "text-title-3",
    },
    tone: toneText,
  },
});

type HeadingSize = NonNullable<VariantProps<typeof headingVariants>["size"]>;
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const SIZE_FOR_LEVEL: Record<HeadingLevel, HeadingSize> = {
  1: "title-1",
  2: "title-2",
  3: "title-3",
  4: "title-3",
  5: "title-3",
  6: "title-3",
};

export interface HeadingProps
  extends RNTextProps,
    VariantProps<typeof headingVariants> {
  /** The outline level; on native it only picks the default size (RN has one `header` role). */
  level?: HeadingLevel;
  ref?: Ref<RNText>;
}

/** A heading (`accessibilityRole="header"`); `size` defaults from `level`. */
export function Heading({
  className,
  level = 2,
  size,
  tone,
  ...props
}: HeadingProps): ReactElement {
  return (
    <RNText
      accessibilityRole="header"
      className={cn(
        headingVariants({
          size: size ?? SIZE_FOR_LEVEL[level],
          tone: tone ?? "default",
        }),
        className
      )}
      {...props}
    />
  );
}
