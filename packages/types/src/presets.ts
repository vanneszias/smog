/**
 * Overlay configuration presets for common use cases
 * Provides pre-configured layouts for sponsor overlays
 */

import type { OverlayConfig } from "./index";

export type PresetName =
  | "bottom-center"
  | "bottom-right"
  | "top-right"
  | "center"
  | "subtle";

export type OverlayPreset = {
  name: PresetName;
  label: string;
  description: string;
  config: OverlayConfig;
  icon: string;
};

export const OVERLAY_PRESETS: OverlayPreset[] = [
  {
    name: "bottom-center",
    label: "Bottom Center",
    description: "Classic placement at the bottom center (recommended)",
    icon: "⬇️",
    config: {
      image: {
        x: 50, // Center horizontally
        y: 79, // 220px from bottom on 1080p
        width: 18,
        height: 18,
      },
      text: {
        x: 50, // Center horizontally
        y: 83,
        fontSize: 4.4,
        color: "#000000",
      },
      animation: {
        startTime: 5, // Last 5 seconds
        fadeInDuration: 1,
      },
    },
  },
  {
    name: "bottom-right",
    label: "Bottom Right",
    description: "Overlay in bottom-right corner (less intrusive)",
    icon: "↘️",
    config: {
      image: {
        x: 88, // Right side
        y: 88, // Bottom
        width: 12,
        height: 12,
      },
      text: {
        x: 88,
        y: 95,
        fontSize: 3,
        color: "#000000",
      },
      animation: {
        startTime: 5,
        fadeInDuration: 1,
      },
    },
  },
  {
    name: "top-right",
    label: "Top Right",
    description: "Overlay in top-right corner",
    icon: "↗️",
    config: {
      image: {
        x: 88,
        y: 12, // Top
        width: 12,
        height: 12,
      },
      text: {
        x: 88,
        y: 5,
        fontSize: 3,
        color: "#000000",
      },
      animation: {
        startTime: 5,
        fadeInDuration: 1,
      },
    },
  },
  {
    name: "center",
    label: "Center",
    description: "Bold center placement (high visibility)",
    icon: "🎯",
    config: {
      image: {
        x: 50,
        y: 50,
        width: 20,
        height: 20,
      },
      text: {
        x: 50,
        y: 60,
        fontSize: 5,
        color: "#000000",
      },
      animation: {
        startTime: 5,
        fadeInDuration: 1,
      },
    },
  },
  {
    name: "subtle",
    label: "Subtle",
    description: "Small bottom-center (minimal distraction)",
    icon: "💫",
    config: {
      image: {
        x: 50,
        y: 90,
        width: 10,
        height: 10,
      },
      text: {
        x: 50,
        y: 95,
        fontSize: 2.5,
        color: "#000000",
      },
      animation: {
        startTime: 3, // Last 3 seconds only
        fadeInDuration: 0.5,
      },
    },
  },
];

/**
 * Get preset by name
 */
export const getPreset = (name: PresetName): OverlayPreset | undefined =>
  OVERLAY_PRESETS.find((preset) => preset.name === name);

/**
 * Get default preset
 */
export const getDefaultPreset = (): OverlayPreset => OVERLAY_PRESETS[0]!;
