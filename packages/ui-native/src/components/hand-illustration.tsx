import { handSvgs } from "@smog/brand/svg";
import type { ColorRole } from "@smog/styles/tokens";
import { tokens } from "@smog/styles/tokens";
import type { ReactElement } from "react";
import { View, type ViewProps } from "react-native";
import { SvgXml } from "react-native-svg";
import { useColor } from "../lib/theme";

export type HandIndex = 0 | 1 | 2;

const VIEW_BOX = 'viewBox="';

/** Width / height of a hand's `0 0 w h` viewBox. */
function aspectOf(svg: string): number {
  const start = svg.indexOf(VIEW_BOX) + VIEW_BOX.length;
  const [, , width, height] = svg
    .slice(start, svg.indexOf('"', start))
    .split(" ")
    .map(Number);
  return (width ?? 1) / (height ?? 1);
}

const ASPECT = handSvgs.map(aspectOf);

export interface HandIllustrationProps extends Omit<ViewProps, "children"> {
  /** The colour role (`primary` by default; native has no `currentColor`). */
  color?: ColorRole;
  /**
   * Which of the three brand hands (`handSvgs`), each with one meaning:
   * 0 points down ("this one"), 1 points across (find), 2 is the open palm
   * (welcome, nothing here yet).
   */
  hand?: HandIndex;
  /** Height in pt (64 by default, as web's `h-16`); the width follows. */
  height?: number;
}

/**
 * One of the brand's hand drawings (from `@smog/brand/svg`), as the web
 * kit's: decorative and hidden from assistive technology.
 */
export function HandIllustration({
  color = "primary",
  hand = 0,
  height = tokens.spacing["16"],
  ...props
}: HandIllustrationProps): ReactElement {
  const fill = useColor(color);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...props}
    >
      <SvgXml
        color={fill}
        height={height}
        width={Math.round(height * (ASPECT[hand] ?? 1))}
        xml={handSvgs[hand]}
      />
    </View>
  );
}
