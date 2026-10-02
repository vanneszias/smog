/**
 * `@smog/render/contract`: what the sponsored-video render takes (phase 6
 * ruling 7). It is stored in `render_job.input`, validated when the job is
 * created and again when phase 7's Workflow starts it. Phase 7 may add
 * optional fields; a breaking change bumps `v`. Client safe (no renderer):
 * the wizard's static preview draws the same layout from these constants.
 */
import { DISPLAY_NAME_MAX } from "@smog/config/constants";
import { tokens } from "@smog/styles/tokens";
import { z } from "zod";

export const RENDER_INPUT_VERSION = 1;

export const renderInputSchema = z.object({
  /** The sponsor's line under the fixed intro (1..35 characters). */
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX),
  /** The R2 key of the logo (`logos/<uuid>`), or `null` for none. */
  logoKey: z.string().min(1).nullable(),
  /** The gesture's own Mux playback id: the source video. */
  sourcePlaybackId: z.string().min(1),
  v: z.literal(RENDER_INPUT_VERSION),
});

export type RenderInput = z.infer<typeof renderInputSchema>;

/**
 * The overlay of the last seconds of the video (spec §8.2): fractions of
 * the video's width and height, so any source size works. The logo box is
 * `size` × `size` of the width and height, centred on (`centerX`,
 * `centerY`); the text is centred at `y`, `fontSize` of the height, in the
 * brand green, on two lines (`intro`, then the display name).
 */
export const RENDER_OVERLAY_LAYOUT = {
  fadeInSeconds: 1,
  logo: { centerX: 0.5, centerY: 0.76, size: 0.22 },
  overlaySeconds: 5,
  slideUpPx: 30,
  text: {
    color: tokens.color.brand.green,
    fontSize: 0.038,
    // The old video's fixed line, in Dutch whatever the viewer's language.
    intro: "Met de warme steun van:",
    y: 0.87,
  },
} as const;
