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

/** The `<Composition>` id of the sponsored video (render and Player). */
export const SPONSORED_VIDEO_ID = "SponsoredVideo";

/** The frame rate of every render (the old `SponsoredVideo`'s 30 fps). */
export const RENDER_FPS = 30;

/**
 * The overlay of the last seconds of the video (spec §8.2): fractions of
 * the video's width and height, so any source size works. The logo box is
 * `size` × `size` of the width and height, centred on (`centerX`,
 * `centerY`). The text is `fontSize` of the height, in the brand green, on
 * two horizontally centred lines: `intro`, whose **top** is at `y`, then
 * the display name (phase 7 ruling 5: the old overlay put the first line's
 * top there, it never centred the text at `y`).
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

/*
 * The render server's HTTP contract (phase 7 ruling 1): `POST /render`
 * takes a `RenderRequest` and answers a `RenderResult`. The Worker, which
 * sends, and the Bun server, which receives, validate the same schemas.
 */

/** A breaking change of the request bumps it (the server refuses others). */
export const RENDER_REQUEST_VERSION = 1;

/** The logo's decoded size cap: the checkout's own limit (`LOGO_MAX_BYTES`). */
export const RENDER_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const LOGO_DATA_URL =
  /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const BASE64_PADDING = /[=]+$/;

/** The decoded byte length of a base64 `data:` URL's payload. */
export function logoDataUrlByteLength(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = payload.match(BASE64_PADDING)?.[0].length ?? 0;
  return (payload.length / 4) * 3 - padding;
}

const logoDataUrlSchema = z
  .string()
  .refine(
    (value) =>
      LOGO_DATA_URL.test(value) &&
      (value.length - value.indexOf(",") - 1) % 4 === 0,
    "must be a base64 PNG, JPEG or WebP data URL"
  )
  .refine(
    (value) => logoDataUrlByteLength(value) <= RENDER_LOGO_MAX_BYTES,
    `must decode to at most ${RENDER_LOGO_MAX_BYTES} bytes`
  );

const httpUrl = z.url({ protocol: /^https?$/ });

export const renderRequestSchema = z.object({
  /** What to render, as stored in `render_job.input`. */
  input: renderInputSchema,
  /** The job's logo read from R2 (ruling 10), or `null` without one. */
  logoDataUrl: logoDataUrlSchema.nullable(),
  /** The job; the server keeps one render slot per job id (ruling 7). */
  renderJobId: z.uuid(),
  /** The source video (a Mux master or static rendition URL). */
  sourceUrl: httpUrl,
  /** The Mux direct upload URL the result is `PUT` to. */
  uploadUrl: httpUrl,
  v: z.literal(RENDER_REQUEST_VERSION),
});

export type RenderRequest = z.infer<typeof renderRequestSchema>;

/**
 * Why a render failed. The first three are the request's own fault and
 * final; the last three may pass on a retry (`isRetryableRenderError`).
 */
export const RENDER_ERROR_CODES = [
  "invalidInput",
  "sourceUnreadable",
  "logoUnreadable",
  "busy",
  "renderFailed",
  "uploadFailed",
] as const;

export type RenderErrorCode = (typeof RENDER_ERROR_CODES)[number];

/** The HTTP status of each failure: 4xx is final, 5xx is retried. */
export const RENDER_ERROR_STATUS: Record<RenderErrorCode, number> = {
  busy: 503,
  invalidInput: 422,
  logoUnreadable: 422,
  renderFailed: 500,
  sourceUnreadable: 422,
  uploadFailed: 502,
};

/** Whether the Workflow's `render` step retries after this failure. */
export function isRetryableRenderError(code: RenderErrorCode): boolean {
  return RENDER_ERROR_STATUS[code] >= 500;
}

/** A positive even size (H.264 needs even dimensions; ruling 5). */
const evenSize = z
  .number()
  .int()
  .positive()
  .refine((value) => value % 2 === 0, "must be even");

export const renderResultSchema = z.discriminatedUnion("ok", [
  z.object({
    /** The size of the uploaded MP4. */
    bytes: z.number().int().positive(),
    frames: z.number().int().positive(),
    height: evenSize,
    /** How long the render and upload took. */
    ms: z.number().int().nonnegative(),
    ok: z.literal(true),
    width: evenSize,
  }),
  z.object({
    code: z.enum(RENDER_ERROR_CODES),
    /** A summary without URLs (the server never logs or answers one). */
    message: z.string(),
    ok: z.literal(false),
  }),
]);

export type RenderResult = z.infer<typeof renderResultSchema>;

/**
 * How the Workflow reaches a renderer (ruling 1): the Container in
 * `container` mode, the local server in `local` mode, the fake renderer
 * (`@smog/render/testing`) in tests. A coded failure is a `RenderResult`;
 * a network fault or a timeout throws (and is retried).
 */
export interface RendererPort {
  render: (request: RenderRequest) => Promise<RenderResult>;
}
