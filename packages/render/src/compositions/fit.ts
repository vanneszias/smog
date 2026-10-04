import { RENDER_OVERLAY_LAYOUT } from "../contract";

/** The share of the video's width the widest text line may take. */
export const OVERLAY_TEXT_MAX_WIDTH = 0.9;

/** The width in px of `text` set in the overlay font at `fontSize` px. */
export type TextMeasure = (text: string, fontSize: number) => number;

export interface OverlayFontSizeInput {
  displayName: string;
  height: number;
  intro: string;
  measure: TextMeasure;
  width: number;
}

/**
 * The overlay's font size in px, the same for both lines (phase 7 ruling 5,
 * [improvement]): the old size (`text.fontSize` of the height), or smaller
 * when the wider line would not fit in 90 % of the width. The old overlay
 * clipped a long name off both edges. Text width scales with the font size,
 * so both lines are measured once, at the old size.
 */
export function overlayFontSize({
  displayName,
  height,
  intro,
  measure,
  width,
}: OverlayFontSizeInput): number {
  const base = RENDER_OVERLAY_LAYOUT.text.fontSize * height;
  const widest = Math.max(measure(intro, base), measure(displayName, base));
  const room = OVERLAY_TEXT_MAX_WIDTH * width;
  return widest > room ? (base * room) / widest : base;
}
