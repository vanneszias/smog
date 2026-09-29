import { logoStackedSvg, logoSvg } from "@smog/brand/svg";
import { useTranslation } from "@smog/i18n/react";
import { type ColorRole, tokens } from "@smog/styles/tokens";
import type { ReactElement, Ref } from "react";
import { View, type ViewProps } from "react-native";
import { SvgXml } from "react-native-svg";
import { cn } from "../lib/cn";
import { useColor } from "../lib/theme";

const SVG = { horizontal: logoSvg, stacked: logoStackedSvg } as const;
/** Heights in pt, as web's `h-6` / `h-8` / `h-12`. */
const HEIGHT = {
  lg: tokens.spacing["12"],
  md: tokens.spacing["8"],
  sm: tokens.spacing["6"],
} as const;
const TONE_ROLE = {
  foreground: "foreground",
  primary: "primary",
} as const satisfies Record<string, ColorRole>;

const VIEW_BOX = 'viewBox="';

/** Width / height of an SVG's `0 0 w h` viewBox (the brand SVGs all have one). */
function aspectOf(svg: string): number {
  const start = svg.indexOf(VIEW_BOX) + VIEW_BOX.length;
  const [, , width, height] = svg
    .slice(start, svg.indexOf('"', start))
    .split(" ")
    .map(Number);
  return (width ?? 1) / (height ?? 1);
}

const ASPECT = {
  horizontal: aspectOf(logoSvg),
  stacked: aspectOf(logoStackedSvg),
} as const;

export interface LogoProps extends Omit<ViewProps, "children"> {
  /** The colour role for `tone="current"`. */
  color?: ColorRole;
  /** Hide it from assistive tech (e.g. next to the app name in text). */
  decorative?: boolean;
  ref?: Ref<View>;
  size?: keyof typeof HEIGHT;
  /**
   * `primary` or `foreground`; `current` (web: the text colour) takes the
   * `color` role, since native has no `currentColor`.
   */
  tone?: keyof typeof TONE_ROLE | "current";
  variant?: keyof typeof SVG;
}

/** The SMOG & Co logo, drawn from `@smog/brand/svg` in a token colour. */
export function Logo({
  className,
  color: currentRole = "foreground",
  decorative = false,
  size = "md",
  tone = "primary",
  variant = "horizontal",
  ...props
}: LogoProps): ReactElement {
  const { t } = useTranslation();
  const color = useColor(tone === "current" ? currentRole : TONE_ROLE[tone]);
  const height = HEIGHT[size];
  const width = Math.round(height * ASPECT[variant]);
  const a11y = decorative
    ? {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      }
    : {
        accessibilityLabel: t("a11y.logo"),
        accessibilityRole: "image" as const,
        accessible: true,
      };
  return (
    <View
      className={cn("shrink-0", className)}
      style={{ height, width }}
      {...a11y}
      {...props}
    >
      <SvgXml color={color} height={height} width={width} xml={SVG[variant]} />
    </View>
  );
}
