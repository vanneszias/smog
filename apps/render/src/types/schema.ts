import { zColor } from "@remotion/zod-types";
import {
  type OverlayConfig,
  DEFAULT_OVERLAY_CONFIG as SMOG_DEFAULT_CONFIG,
} from "@smog/types";
import {
  SPONSOR_NAME_MAX_LENGTH,
  type SponsoredVideoInputProps,
} from "@smog/types/render";
import { z } from "zod";

// Re-export the OverlayConfig type from @smog/types for consistency
export type { OverlayConfig } from "@smog/types";

// Zod schema matching @smog/types OverlayConfig
const OverlayConfigSchema = z.object({
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
  sponsorName: z
    .string()
    .max(
      SPONSOR_NAME_MAX_LENGTH,
      `Sponsor name must be ${SPONSOR_NAME_MAX_LENGTH} characters or less`
    )
    .describe("Name of the sponsor"),
  overlayConfig: OverlayConfigSchema.optional(),
});

export type SponsoredVideoProps = z.infer<typeof SponsoredVideoSchema>;

// Compile-time guard that the props `apps/site` sends (`@smog/types/render`)
// are exactly what this schema parses: every contract prop must exist here,
// and the contract must satisfy the schema's input. A rename on either side
// fails `check-types` in this package instead of a render failing inside zod
// on Lambda. `overlayConfig` is optional here and absent from the contract,
// which both checks allow.
type SponsoredVideoInput = z.input<typeof SponsoredVideoSchema>;
type AssertTrue<T extends true> = T;
type _ContractFitsSchema = AssertTrue<
  SponsoredVideoInputProps extends SponsoredVideoInput ? true : false
>;
type _ContractHasNoUnknownProps = AssertTrue<
  Exclude<
    keyof SponsoredVideoInputProps,
    keyof SponsoredVideoInput
  > extends never
    ? true
    : false
>;

// Use the default config from @smog/types
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = SMOG_DEFAULT_CONFIG;

// Video dimensions for 9:16 vertical video
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
