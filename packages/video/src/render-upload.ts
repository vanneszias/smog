import type { Environment } from "@smog/config/env/worker";
import { type Mux, muxRequest } from "./client";
import {
  type MuxUpload,
  muxUploadDataSchema,
  renderJobPassthrough,
  toMuxUpload,
  UPLOAD_TIMEOUT_SECONDS,
} from "./uploads";

export interface RenderUploadOptions {
  /**
   * The `SITE_URL` origin. Mux's create-upload schema requires
   * `cors_origin`; it is harmless for the renderer's server-side PUT,
   * which sends no `Origin` (DECISIONS, amending ruling 4.6.3).
   */
  corsOrigin: string;
  /** This Worker's env (`ENVIRONMENT`): the passthrough carries it (phase 8 ruling 4). */
  environment: Environment;
  /** The `render_job` id: the passthrough is `render-job:<env>:<id>`. */
  renderJobId: string;
  /** A test upload (watermarked, deleted after 24 h): dev only. */
  test: boolean;
}

/**
 * `POST /video/v1/uploads` for a rendered sponsored video (phase 7 ruling
 * 4, step `render`): the `render-job:<env>:<id>` passthrough, public playback,
 * the site origin as `cors_origin` and the default timeout. Unlike a
 * gesture upload it asks for no static renditions; unlike the old
 * `uploadToMux`, no `master_access`. A fresh one per render attempt, so a
 * retry never PUTs to a URL an earlier attempt may have filled.
 *
 * The returned `url` is a signed upload URL: never log it, and never keep
 * it in Workflow step output (ruling 4, I-3).
 */
export async function createRenderUpload(
  mux: Mux,
  { corsOrigin, environment, renderJobId, test }: RenderUploadOptions
): Promise<MuxUpload & { url: string }> {
  const upload = toMuxUpload(
    await muxRequest(mux, "/video/v1/uploads", {
      body: {
        cors_origin: corsOrigin,
        new_asset_settings: {
          passthrough: renderJobPassthrough(environment, renderJobId),
          playback_policies: ["public"],
        },
        ...(test ? { test: true } : {}),
        timeout: UPLOAD_TIMEOUT_SECONDS,
      },
      method: "POST",
      schema: muxUploadDataSchema,
    })
  );
  if (!upload.url) {
    throw new Error("[video] Mux created a render upload without a URL");
  }
  return { ...upload, url: upload.url };
}
