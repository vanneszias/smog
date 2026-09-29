import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { toneText } from "../lib/variants";

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

type TextElement = "p" | "span" | "div" | "label" | "strong" | "small";

export interface TextProps
  extends Omit<ComponentProps<"p">, "ref">,
    VariantProps<typeof textVariants> {
  /** The element to render (`p` by default). */
  as?: TextElement;
  ref?: ComponentProps<"p">["ref"];
}

/** Body copy: `body | body-sm | caption`, a tone and a weight. */
export function Text({
  as = "p",
  className,
  size,
  tone,
  weight,
  ...props
}: TextProps): ReactNode {
  // Every allowed element takes the same HTML attributes as `p`.
  const Element = as as "p";
  return (
    <Element
      className={cn(textVariants({ size, tone, weight }), className)}
      {...props}
    />
  );
}

const headingVariants = cva("text-balance font-semibold", {
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
  extends ComponentProps<"h2">,
    VariantProps<typeof headingVariants> {
  /** The document outline level (`h1`–`h6`), independent of the size. */
  level?: HeadingLevel;
}

/** A heading; `size` defaults from `level` (1 → title-1, 2 → title-2, 3+ → title-3). */
export function Heading({
  className,
  level = 2,
  size,
  tone,
  ...props
}: HeadingProps): ReactNode {
  const Element = `h${level}` as const;
  return (
    <Element
      className={cn(
        headingVariants({ size: size ?? SIZE_FOR_LEVEL[level], tone }),
        className
      )}
      {...props}
    />
  );
}
