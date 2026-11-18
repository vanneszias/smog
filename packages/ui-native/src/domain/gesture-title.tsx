import { handSvgs } from "@smog/brand/svg";
import { tokens } from "@smog/styles/tokens";
import { type ReactElement, useCallback, useState } from "react";
import {
  type LayoutChangeEvent,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { SvgXml } from "react-native-svg";
import { cn } from "../lib/cn";

/*
 * "The hand points at the word": the title every gesture video opens with,
 * drawn by the kit so a textless video and the burned-in title look the
 * same. The numbers are the web kit's (`GestureTitle` in `@smog/ui-web`,
 * DESIGN.md "Video player"), shares of the frame's width unless said: the
 * pointing hand starts 6 % in and is 23 % wide, its centre 3.5 % lower
 * than the name's; the name follows 0.5 % after it in Figtree Regular,
 * white, at 10.7 % of the width (less for a long word, so the longest word
 * fits in 64 %), the row centred 20.7 % down the frame (of its height).
 */

/** The side inset. */
const INSET = 0.06;
/** The hand's width. */
const HAND_WIDTH = 0.23;
/** The hand's height over its width (`hand-2.svg` is 400 by 200). */
const HAND_ASPECT = 0.5;
/** How far the hand sits below the name in the centred row (its top margin). */
const HAND_DROP = 0.07;
/** The gap between the hand and the name. */
const GAP = 0.005;
/** The name's largest size. */
const MAX_SIZE = 0.107;
/** The share of the width the name may take. */
const NAME_WIDTH = 0.64;
/** Figtree's average advance per character, in em (measured on Dutch names). */
const CHAR_EM = 0.55;
/** Where the row's centre sits, as a share of the frame's height. */
const ROW_CENTRE = 0.207;

/** Splits a name into its words. */
const WORDS = /\s+/u;

/** White over the studio set in both themes, as the burned-in title. */
const WHITE = tokens.color.light.sidebarForeground;

/** The name's size in pt: 10.7 % of the width, or less so its longest word fits. */
function titleFontSize(name: string, frameWidth: number): number {
  const longest = Math.max(
    1,
    ...name.split(WORDS).map((word) => [...word].length)
  );
  const fit = (NAME_WIDTH * frameWidth) / (longest * CHAR_EM);
  return Math.min(MAX_SIZE * frameWidth, fit);
}

export interface GestureTitleProps extends Omit<ViewProps, "children"> {
  className?: string;
  name: string;
}

/**
 * The pointing hand and the name over a frame; it fills its parent (the
 * frame) and measures it. Decorative by itself: callers hide it from
 * assistive technology where the name is already said.
 */
export function GestureTitle({
  className,
  name,
  ...props
}: GestureTitleProps): ReactElement {
  const [frame, setFrame] = useState({ frameHeight: 0, frameWidth: 0 });
  const measure = useCallback((event: LayoutChangeEvent): void => {
    const { height, width } = event.nativeEvent.layout;
    setFrame((current) =>
      current.frameHeight === height && current.frameWidth === width
        ? current
        : { frameHeight: height, frameWidth: width }
    );
  }, []);
  const { frameHeight: height, frameWidth: width } = frame;
  const size = titleFontSize(name, width);
  const handWidth = HAND_WIDTH * width;
  return (
    <View
      className={cn("absolute inset-0", className)}
      onLayout={measure}
      pointerEvents="none"
      testID="gesture-title"
      {...props}
    >
      {width > 0 ? (
        // A band from the top to 41.4 % of the frame centres the row 20.7 % down;
        // the row may outgrow it at large text sizes (nothing is clipped).
        <View
          className="absolute inset-x-0 top-0 flex-row items-center justify-center"
          style={{
            bottom: (1 - 2 * ROW_CENTRE) * height,
            gap: GAP * width,
            paddingHorizontal: INSET * width,
          }}
        >
          <View style={{ marginTop: HAND_DROP * width }}>
            <SvgXml
              color={WHITE}
              height={handWidth * HAND_ASPECT}
              testID="gesture-title-hand"
              width={handWidth}
              xml={handSvgs[1]}
            />
          </View>
          <Text
            className="min-w-0 flex-1 font-regular"
            style={{
              color: WHITE,
              fontSize: size,
              letterSpacing: -0.01 * size,
              lineHeight: 1.05 * size,
            }}
          >
            {name}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
