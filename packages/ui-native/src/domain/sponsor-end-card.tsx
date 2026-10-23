import { useTranslation } from "@smog/i18n/react";
import type { ReactElement } from "react";
import { Image, View, type ViewProps } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { Card } from "../components/card";
import { Text } from "../components/text";
import { cn } from "../lib/cn";

export interface SponsorEndCardProps extends Omit<ViewProps, "children"> {
  className?: string;
  /** The logo's absolute URL; none when the sponsor has no logo. */
  logoSrc?: string | null | undefined;
  /** The sponsor's name, as typed (never translated or reformatted). */
  name: string;
}

/** The card's fade-in, in ms. */
const FADE_MS = 250;

/**
 * The sponsor message over the last seconds of a gesture video (phase 10b
 * ruling 9): "Made possible by" in the viewer's language (the catalogue),
 * the sponsor's name as typed and the logo, on a solid `card` surface so the
 * text reads on any frame. Decoration, hidden from the screen reader (the
 * gesture screen states the credit in text); taps go through it to the
 * video's controls; it fades in unless the system asks for reduced motion.
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
      className={cn("items-center", className)}
      entering={reducedMotion ? undefined : FadeIn.duration(FADE_MS)}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="sponsor-end-card"
      {...props}
    >
      <Card
        className="max-w-full flex-row items-center gap-3 rounded-xl px-4 py-3"
        variant="raised"
      >
        {logoSrc ? (
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={{ uri: logoSrc }}
            style={LOGO}
            testID="sponsor-end-card-logo"
          />
        ) : null}
        <View className="shrink">
          <Text size="body-sm" tone="muted">
            {t("endCard.message")}
          </Text>
          <Text weight="semibold">{name}</Text>
        </View>
      </Card>
    </Animated.View>
  );
}

const LOGO = { borderRadius: 6, height: 48, width: 48 } as const;
