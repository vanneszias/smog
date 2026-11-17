import { tokens } from "@smog/styles/tokens";
import { muxThumbnailUrl } from "@smog/utils";
import Play from "lucide-react-native/icons/play";
import type { ReactElement } from "react";
import { Image, View } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE } from "../lib/icon";
import { useColor } from "../lib/theme";
import type { CategoryRef } from "./types";

const THUMBNAIL_STYLE = { aspectRatio: 3 / 4 } as const;
/** The play disc, 36 pt as the web's `size-9` (native's rem is 14). */
const PLAY_SIZE = tokens.spacing["8"] + tokens.spacing["1"];
const PLAY_STYLE = { height: PLAY_SIZE, width: PLAY_SIZE } as const;

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
      className="absolute bottom-2 left-2 items-center justify-center rounded-full bg-highlight"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={PLAY_STYLE}
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
