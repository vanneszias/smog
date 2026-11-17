import { muxThumbnailUrl } from "@smog/utils";
import Play from "lucide-react-native/icons/play";
import type { ReactElement } from "react";
import { Image, View } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE } from "../lib/icon";
import { useColor } from "../lib/theme";
import type { CategoryRef } from "./types";

const THUMBNAIL_STYLE = { aspectRatio: 3 / 4 } as const;

/**
 * The orange play glyph on a still (as the web card): orange means "do
 * it", and the card is a video. Decorative; the card is named by the
 * gesture.
 */
function PlayBadge(): ReactElement {
  const ink = useColor("highlightForeground");
  return (
    <View
      accessibilityElementsHidden
      className="absolute bottom-2 left-2 size-9 items-center justify-center rounded-full bg-highlight"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="gesture-play"
    >
      <Play color={ink} fill={ink} size={ICON_SIZE.sm} />
    </View>
  );
}

/** A decorative Mux still at 3:4 (the name next to it is the text alternative). */
export function GestureThumbnail({
  className,
  playbackId,
  showPlay = false,
  testID,
  width,
}: {
  className?: string;
  playbackId: string;
  /** The orange play glyph at the bottom left (a card that opens the video). */
  showPlay?: boolean;
  testID?: string;
  /** Requested pixel width (about twice the rendered width). */
  width: number;
}): ReactElement {
  const still = (
    <Image
      accessibilityElementsHidden
      accessibilityIgnoresInvertColors
      className={cn("bg-surface-sunken", className)}
      importantForAccessibility="no"
      resizeMode="cover"
      source={{ uri: muxThumbnailUrl(playbackId, { width }) }}
      style={THUMBNAIL_STYLE}
      testID={testID}
    />
  );
  if (!showPlay) {
    return still;
  }
  return (
    <View className="relative">
      {still}
      <PlayBadge />
    </View>
  );
}

/** "Greetings, Everyday". */
export function categoryLine(categories: readonly CategoryRef[]): string {
  return categories.map((category) => category.name).join(", ");
}
