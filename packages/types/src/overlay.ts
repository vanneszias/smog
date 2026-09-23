/**
 * @fileoverview Sponsor overlay configuration
 *
 * Where a sponsor's logo and text sit on a composed video, and how they fade
 * in. `apps/render` validates its input props against this shape.
 */

/**
 * Overlay configuration for rendering a sponsor's logo and text on a video.
 * All coordinates are relative percentages of the video dimensions (0–100).
 */
export interface OverlayConfig {
  /** Image overlay properties */
  image: {
    /** X position as % of video width (0–100) */
    x: number;
    /** Y position as % of video height (0–100) */
    y: number;
    /** Width as % of video width (0–100) */
    width: number;
    /** Height as % of video height (0–100) */
    height: number;
  };
  /** Text overlay properties */
  text: {
    /** X position as % of video width (0–100) */
    x: number;
    /** Y position as % of video height (0–100) */
    y: number;
    /** Font size as % of video height (0–20) */
    fontSize: number;
    /** Hex color string, e.g. "#000000" */
    color: string;
  };
  /** Fade-in animation properties */
  animation: {
    /** Seconds from the end of the video at which to show the overlay */
    startTime: number;
    /** Duration of the fade-in in seconds */
    fadeInDuration: number;
  };
}

/**
 * Default overlay configuration matching the current production values.
 * Centered logo with two-line text layout.
 */
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  image: {
    x: 50,
    y: 76,
    width: 22,
    height: 22,
  },
  text: {
    x: 50,
    y: 87,
    fontSize: 3.8,
    color: "#00805f",
  },
  animation: {
    startTime: 5,
    fadeInDuration: 1,
  },
};
