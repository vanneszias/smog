import { muxThumbnailUrl } from "@smog/utils";
import type { ReactElement } from "react";
import { Image } from "react-native";
import { cn } from "../lib/cn";
import type { CategoryRef } from "./types";

const THUMBNAIL_STYLE = { aspectRatio: 3 / 4 } as const;

/** A decorative Mux still at 3:4 (the name next to it is the text alternative). */
export function GestureThumbnail({
  className,
  playbackId,
  testID,
  width,
}: {
  className?: string;
  playbackId: string;
  testID?: string;
  /** Requested pixel width (about twice the rendered width). */
  width: number;
}): ReactElement {
  return (
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
}

/** "Greetings, Everyday". */
export function categoryLine(categories: readonly CategoryRef[]): string {
  return categories.map((category) => category.name).join(", ");
}
