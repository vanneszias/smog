import { zColor } from "@remotion/zod-types";
import {
  type OverlayConfig,
  DEFAULT_OVERLAY_CONFIG as SMOG_DEFAULT_CONFIG,
} from "@smog/types";
import { z } from "zod";

// Re-export the OverlayConfig type from @smog/types for consistency
export type { OverlayConfig } from "@smog/types";

// Zod schema matching @smog/types OverlayConfig
export const OverlayConfigSchema = z.object({
  image: z.object({
    x: z.number().min(0).max(100).describe("X position as % (0-100)"),
    y: z.number().min(0).max(100).describe("Y position as % (0-100)"),
    width: z.number().min(0).max(100).describe("Width as % of video width"),
    height: z.number().min(0).max(100).describe("Height as % of video height"),
  }),
  text: z.object({
    x: z.number().min(0).max(100).describe("X position as %"),
    y: z.number().min(0).max(100).describe("Y position as %"),
    fontSize: z
      .number()
      .min(1)
      .max(20)
      .describe("Font size as % of video height"),
    color: zColor().describe("Text color"),
  }),
  animation: z.object({
    startTime: z
      .number()
      .min(0)
      .describe("Seconds from end of video to start overlay"),
    fadeInDuration: z.number().min(0).describe("Fade-in duration in seconds"),
  }),
});

export const SponsoredVideoSchema = z.object({
  videoSrc: z
    .string()
    .url()
    .describe("URL of the source video (Mux playback URL)"),
  logoUrl: z.string().optional().describe("URL of the sponsor logo (optional)"),
  sponsorName: z.string().describe("Name of the sponsor"),
  overlayConfig: OverlayConfigSchema.optional(),
});

export type SponsoredVideoProps = z.infer<typeof SponsoredVideoSchema>;

// Use the default config from @smog/types
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = SMOG_DEFAULT_CONFIG;

// Video dimensions for 9:16 vertical video
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
