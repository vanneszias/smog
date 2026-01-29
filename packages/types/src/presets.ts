/**
 * Fixed sponsor overlay configuration
 * Single layout for all sponsorships: centered logo + text
 */

import type { OverlayConfig } from "./index";

/**
 * The single sponsor overlay configuration
 * Layout: Logo centered above text with fade-in animation
 */
export const SPONSOR_OVERLAY_CONFIG: OverlayConfig = {
  image: {
    x: 50, // Center horizontally
    y: 78, // Logo above text (220px from bottom on 1080p)
    width: 15, // Slightly smaller than default
    height: 15,
  },
  text: {
    x: 50, // Center horizontally
    y: 85, // Below logo (160px from bottom on 1080p)
    fontSize: 4, // Slightly smaller for two lines
    color: "#00805f", // White text for better visibility
  },
  animation: {
    startTime: 5, // Last 5 seconds
    fadeInDuration: 1,
  },
};

/**
 * Get sponsor overlay configuration
 * Always returns the fixed sponsor layout
 */
export const getSponsorOverlayConfig = (): OverlayConfig =>
  SPONSOR_OVERLAY_CONFIG;
