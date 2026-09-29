import { zColor } from "@remotion/zod-types";
import {
  type OverlayConfig,
  DEFAULT_OVERLAY_CONFIG as SMOG_DEFAULT_CONFIG,
} from "@smog/types";
import { z } from "zod";

// Re-export the OverlayConfig type from @smog/types for consistency
export type { OverlayConfig } from "@smog/types";

// Zod schema matching @smog/types OverlayConfig
const OverlayConfigSchema = z.object({
  animation: z.object({
    fadeInDuration: z.number().min(0).describe("Fade-in duration in seconds"),
    startTime: z
      .number()
      .min(0)
      .describe("Seconds from end of video to start overlay"),
  }),
  image: z.object({
    height: z.number().min(0).max(100).describe("Height as % of video height"),
    width: z.number().min(0).max(100).describe("Width as % of video width"),
    x: z.number().min(0).max(100).describe("X position as % (0-100)"),
    y: z.number().min(0).max(100).describe("Y position as % (0-100)"),
  }),
  text: z.object({
    color: zColor().describe("Text color"),
    fontSize: z
      .number()
      .min(1)
      .max(20)
      .describe("Font size as % of video height"),
    x: z.number().min(0).max(100).describe("X position as %"),
    y: z.number().min(0).max(100).describe("Y position as %"),
  }),
});

export const SponsoredVideoSchema = z.object({
  logoUrl: z.string().optional().describe("URL of the sponsor logo (optional)"),
  overlayConfig: OverlayConfigSchema.optional(),
  sponsorName: z
    .string()
    .max(35, "Sponsor name must be 35 characters or less")
    .describe("Name of the sponsor"),
  videoSrc: z
    .string()
    .url()
    .describe("URL of the source video (Mux playback URL)"),
});

export type SponsoredVideoProps = z.infer<typeof SponsoredVideoSchema>;

// Use the default config from @smog/types
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = SMOG_DEFAULT_CONFIG;

// Video dimensions for 9:16 vertical video
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
