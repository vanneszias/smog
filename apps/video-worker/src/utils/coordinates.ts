/**
 * Coordinate conversion utilities for video overlay positioning
 * Converts percentage-based coordinates to pixel values
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface VideoDimensions {
  width: number;
  height: number;
}

/**
 * Convert percentage to pixels
 */
export const percentToPixels = (
  percentage: number,
  dimension: number
): number => Math.round((percentage / 100) * dimension);

/**
 * Convert center point to top-left position
 * Useful for overlay positioning where config uses center but FFmpeg needs top-left
 */
export const centerToTopLeft = (center: Point, size: Size): Point => ({
  x: center.x - Math.round(size.width / 2),
  y: center.y - Math.round(size.height / 2),
});

/**
 * Convert overlay configuration percentages to pixel values
 */
export const convertOverlayPosition = (
  centerXPercent: number,
  centerYPercent: number,
  widthPercent: number,
  heightPercent: number,
  videoDimensions: VideoDimensions
): { position: Point; size: Size } => {
  const width = percentToPixels(widthPercent, videoDimensions.width);
  const height = percentToPixels(heightPercent, videoDimensions.height);
  const centerX = percentToPixels(centerXPercent, videoDimensions.width);
  const centerY = percentToPixels(centerYPercent, videoDimensions.height);

  const position = centerToTopLeft(
    { x: centerX, y: centerY },
    { width, height }
  );

  return {
    position,
    size: { width, height },
  };
};

/**
 * Convert text configuration percentages to pixel values
 */
export const convertTextPosition = (
  centerXPercent: number,
  yPercent: number,
  fontSizePercent: number,
  videoDimensions: VideoDimensions
): { centerX: number; y: number; fontSize: number } => ({
  centerX: percentToPixels(centerXPercent, videoDimensions.width),
  y: percentToPixels(yPercent, videoDimensions.height),
  fontSize: percentToPixels(fontSizePercent, videoDimensions.height),
});

/**
 * Validate that percentage values are within valid range (0-100)
 */
export const validatePercentage = (value: number, name: string): void => {
  if (value < 0 || value > 100) {
    throw new Error(`${name} must be between 0 and 100 (got ${value})`);
  }
};
