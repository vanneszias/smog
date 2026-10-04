import { type Mux, muxRequest } from "./client";
import {
  type MuxUpload,
  muxUploadDataSchema,
  renderJobPassthrough,
  toMuxUpload,
  UPLOAD_TIMEOUT_SECONDS,
} from "./uploads";

export interface RenderUploadOptions {
  /** The `render_job` id: the passthrough is `render-job:<id>`. */
  renderJobId: string;
  /** A test upload (watermarked, deleted after 24 h): dev only. */
  test: boolean;
}

/**
 * `POST /video/v1/uploads` for a rendered sponsored video (phase 7 ruling
 * 4, step `render`): the `render-job:<id>` passthrough, public playback and
 * the default timeout. Unlike a gesture upload it sends no `cors_origin`
 * (the renderer PUTs server side) and no static renditions; and unlike the
 * old `uploadToMux`, no `master_access`. A fresh one per render attempt,
 * so a retry never PUTs to a URL an earlier attempt may have filled.
 */
export async function createRenderUpload(
  mux: Mux,
  { renderJobId, test }: RenderUploadOptions
): Promise<MuxUpload & { url: string }> {
  const upload = toMuxUpload(
    await muxRequest(mux, "/video/v1/uploads", {
      body: {
        new_asset_settings: {
          passthrough: renderJobPassthrough(renderJobId),
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
