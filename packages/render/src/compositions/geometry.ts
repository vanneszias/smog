import { interpolate, spring } from "remotion";
import { RENDER_OVERLAY_LAYOUT } from "../contract";

/** The line height of both text lines, as a multiple of the font size. */
export const OVERLAY_LINE_HEIGHT = 1.2;

/** The gap above line 2 (the old `fontSize * 0.3`). */
const LINE_GAP = 0.3;

export interface OverlayGeometry {
  /** Line 1's top (`text.y` of the height). */
  line1Top: number;
  /** Line 2's top: line 1's, plus a line height, plus the old gap. */
  line2Top: number;
  /** The logo's box, `contain`-fitted, centred on (`centerX`, `centerY`). */
  logo: { height: number; left: number; top: number; width: number };
}

/**
 * Where the old `SponsorOverlay` put the logo and the two text lines, in px
 * (phase 7 ruling 5). `fontSize` is `overlayFontSize`'s answer.
 */
export function overlayGeometry({
  fontSize,
  height,
  width,
}: {
  fontSize: number;
  height: number;
  width: number;
}): OverlayGeometry {
  const { logo, text } = RENDER_OVERLAY_LAYOUT;
  const logoWidth = logo.size * width;
  const logoHeight = logo.size * height;
  const line1Top = text.y * height;
  return {
    line1Top,
    line2Top: line1Top + OVERLAY_LINE_HEIGHT * fontSize + LINE_GAP * fontSize,
    logo: {
      height: logoHeight,
      left: logo.centerX * width - logoWidth / 2,
      top: logo.centerY * height - logoHeight / 2,
      width: logoWidth,
    },
  };
}

/**
 * The frame the overlay starts on: `overlaySeconds` before the end. It is
 * negative for a clip shorter than that, so the overlay is there from the
 * first frame.
 */
export function overlayStartFrame({
  durationInFrames,
  fps,
}: {
  durationInFrames: number;
  fps: number;
}): number {
  return durationInFrames - RENDER_OVERLAY_LAYOUT.overlaySeconds * fps;
}

export interface OverlayTiming {
  opacity: number;
  /** The slide up, in px, on the whole overlay. */
  translateY: number;
}

/**
 * The old overlay's animation: nothing before the start frame, then a
 * damped spring (no bounce) over `fadeInSeconds` for the opacity, and a
 * slide from `slideUpPx` to 0 on the same progress.
 */
export function overlayTiming({
  durationInFrames,
  fps,
  frame,
}: {
  durationInFrames: number;
  fps: number;
  frame: number;
}): OverlayTiming | null {
  const startFrame = overlayStartFrame({ durationInFrames, fps });
  if (frame < startFrame) {
    return null;
  }
  const progress = spring({
    config: { damping: 200 },
    durationInFrames: RENDER_OVERLAY_LAYOUT.fadeInSeconds * fps,
    fps,
    frame: frame - startFrame,
  });
  return {
    opacity: progress,
    translateY: interpolate(
      progress,
      [0, 1],
      [RENDER_OVERLAY_LAYOUT.slideUpPx, 0]
    ),
  };
}
