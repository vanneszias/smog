import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, Ref } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "../lib/cn";
import { toneText } from "../lib/theme";
import { surfaceRoles, useSurface } from "./surface";

const textVariants = cva("", {
  defaultVariants: { size: "body", tone: "default", weight: "regular" },
  variants: {
    size: {
      body: "text-body",
      "body-sm": "text-body-sm",
      caption: "text-caption",
      // The line under a display title (the home hero, the auth band).
      lead: "text-lead",
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

/** Body copy: `lead | body | body-sm | caption`, a tone and a weight. Web's `as` has no native counterpart. */
export function Text({
  className,
  size,
  tone,
  weight,
  ...props
}: TextProps): ReactElement {
  const onSurface = useSurfaceText(tone);
  return (
    <RNText
      className={cn(textVariants({ size, tone, weight }), onSurface, className)}
      {...props}
    />
  );
}

/**
 * On a green surface the default and muted tones are the surface's text
 * colours; the status tones keep theirs (they are not AA on green).
 */
function useSurfaceText(tone: string | null | undefined): string | undefined {
  const roles = surfaceRoles(useSurface());
  if (tone === "muted") {
    return roles.mutedClass;
  }
  return tone === undefined || tone === null || tone === "default"
    ? roles.foregroundClass
    : undefined;
}

const headingVariants = cva("font-semibold", {
  variants: {
    size: {
      // The display step is the one bold heading, as on the web.
      display: "text-display font-bold",
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

/**
 * How far the system text size may grow the largest titles. iOS scales its
 * own large titles less than body text; without a cap a display title at
 * the largest accessibility sizes pushes the search field off the screen.
 * At 1.5 a display title still reaches 60 pt and title-1 42 pt; body text
 * and the smaller titles are never capped.
 */
const DISPLAY_FONT_SCALE_CAP = 1.5;

const CAPPED_SIZES: ReadonlySet<HeadingSize> = new Set(["display", "title-1"]);

/** A heading (`accessibilityRole="header"`); `size` defaults from `level`. */
export function Heading({
  className,
  level = 2,
  maxFontSizeMultiplier,
  size,
  tone,
  ...props
}: HeadingProps): ReactElement {
  const onSurface = useSurfaceText(tone);
  const resolved = size ?? SIZE_FOR_LEVEL[level];
  return (
    <RNText
      accessibilityRole="header"
      className={cn(
        headingVariants({ size: resolved, tone: tone ?? "default" }),
        onSurface,
        className
      )}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ??
        (CAPPED_SIZES.has(resolved) ? DISPLAY_FONT_SCALE_CAP : undefined)
      }
      {...props}
    />
  );
}
