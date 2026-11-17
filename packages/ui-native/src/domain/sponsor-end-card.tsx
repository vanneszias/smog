import { useTranslation } from "@smog/i18n/react";
import { tokens } from "@smog/styles/tokens";
import type { ReactElement } from "react";
import { Image, StyleSheet, Text, View, type ViewProps } from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { cn } from "../lib/cn";
import { easeEnter, easeStandard, MOTION_MS } from "../lib/motion";
import { useColor } from "../lib/theme";

export interface SponsorEndCardProps extends Omit<ViewProps, "children"> {
  className?: string;
  /** The logo's absolute URL; none when the sponsor has no logo. */
  logoSrc?: string | null | undefined;
  /** The sponsor's name, as typed (never translated or reformatted). */
  name: string;
}

/** How far the card rises as it enters (web `translate-y-2`). */
const RISE = tokens.spacing["2"];
/** Under the text: 16 pt, and 64 more to clear the native control bar. */
const BOTTOM = { paddingBottom: tokens.spacing["4"] + tokens.spacing["16"] };
/** The logo's light plate: 6 pt around it, as web. */
const PLATE = { padding: tokens.spacing["1"] * 1.5 };

/** The band: solid deep green over its lower 70 %, then fading to clear. */
function Band(): ReactElement {
  const green = useColor("sidebar");
  return (
    <Svg
      accessibilityElementsHidden
      height="100%"
      importantForAccessibility="no-hide-descendants"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      testID="sponsor-end-card-band"
      width="100%"
    >
      <Defs>
        <LinearGradient id="sponsor-band" x1="0" x2="0" y1="1" y2="0">
          <Stop offset="0" stopColor={green} stopOpacity={1} />
          <Stop offset="0.7" stopColor={green} stopOpacity={1} />
          <Stop offset="1" stopColor={green} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#sponsor-band)" height="100%" width="100%" />
    </Svg>
  );
}

/**
 * The sponsor message over the last seconds of a gesture video (phase 10b
 * ruling 9), drawn as part of the film, as on the web: a deep green band
 * rising from the bottom of the frame (the `sidebar` green, solid behind
 * the text, so `sidebar-foreground` and `sidebar-foreground-muted` on
 * `sidebar` hold on any frame), "Made possible by" in the viewer's
 * language, the sponsor's name as typed and the logo on a light plate. The
 * caller places it at the bottom of the frame; its bottom padding keeps
 * the name above the native control bar. The values are the web kit's
 * (DESIGN.md, "Video player").
 *
 * Decoration, hidden from the screen reader (the gesture screen states the
 * credit in text); taps go through it to the video's controls. It rises
 * 8 pt and fades in over `slow` on the enter curve, and fades out faster
 * (`normal`, the standard curve) when the video loops or is seeked back
 * (the web also drops it 8 px; Reanimated's exit offset would need
 * `withTargetValues`, which its Jest mock lacks); under reduced motion it
 * appears and goes at once.
 */
export function SponsorEndCard({
  className,
  logoSrc,
  name,
  ...props
}: SponsorEndCardProps): ReactElement {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View
      accessibilityElementsHidden
      className={cn("pt-16", className)}
      entering={
        reducedMotion
          ? undefined
          : FadeInDown.duration(MOTION_MS.slow)
              .easing(easeEnter)
              .withInitialValues({ transform: [{ translateY: RISE }] })
      }
      exiting={
        reducedMotion
          ? undefined
          : FadeOut.duration(MOTION_MS.normal).easing(easeStandard)
      }
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={BOTTOM}
      testID="sponsor-end-card"
      {...props}
    >
      <Band />
      <View className="flex-row items-center gap-3 px-5">
        {logoSrc ? (
          <View
            className="shrink-0 rounded-md bg-sidebar-foreground"
            style={PLATE}
          >
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={{ uri: logoSrc }}
              style={LOGO}
              testID="sponsor-end-card-logo"
            />
          </View>
        ) : null}
        <View className="min-w-0 shrink">
          <Text
            className="font-regular text-body-sm text-sidebar-foreground-muted"
            testID="sponsor-end-card-message"
          >
            {t("endCard.message")}
          </Text>
          <Text className="font-semibold text-sidebar-foreground text-title-3">
            {name}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const LOGO = { height: 40, width: 40 } as const;
