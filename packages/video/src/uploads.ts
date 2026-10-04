import { z } from "zod";
import { type Mux, MuxApiError, muxRequest } from "./client";
import { UPLOAD_STATUSES, type UploadStatus } from "./schema";

/** How long the signed upload URL stays valid (Mux's default; 60–604800). */
export const UPLOAD_TIMEOUT_SECONDS = 3600;

/** The passthrough prefix of an admin gesture upload. */
export const GESTURE_UPLOAD_PREFIX = "gesture-upload:";

/**
 * The passthrough prefix of a rendered sponsored video's upload (phase 7,
 * W-02): `render-job:<render_job.id>`. The webhook routes these to the
 * job's Workflow instead of the gesture upload records.
 */
export const RENDER_JOB_PREFIX = "render-job:";

export function isGestureUpload(
  passthrough: string | null | undefined
): boolean {
  return passthrough?.startsWith(GESTURE_UPLOAD_PREFIX) ?? false;
}

/** A fresh `gesture-upload:<uuid>` passthrough. */
export function gestureUploadPassthrough(): string {
  return `${GESTURE_UPLOAD_PREFIX}${crypto.randomUUID()}`;
}

/** The `render-job:<id>` passthrough of a render job's upload. */
export function renderJobPassthrough(renderJobId: string): string {
  return `${RENDER_JOB_PREFIX}${renderJobId}`;
}

/** The render job id of a `render-job:<id>` passthrough, or `null`. */
export function renderJobIdOf(
  passthrough: string | null | undefined
): string | null {
  if (!passthrough?.startsWith(RENDER_JOB_PREFIX)) {
    return null;
  }
  const id = passthrough.slice(RENDER_JOB_PREFIX.length);
  return id === "" ? null : id;
}

export const muxUploadDataSchema = z.object({
  asset_id: z.string().nullish(),
  error: z
    .object({ message: z.string().nullish(), type: z.string().nullish() })
    .nullish(),
  id: z.string(),
  new_asset_settings: z
    .object({ passthrough: z.string().nullish() })
    .loose()
    .nullish(),
  status: z.enum(UPLOAD_STATUSES),
  url: z.string().nullish(),
});

export interface MuxUpload {
  assetId: string | null;
  error: string | null;
  id: string;
  passthrough: string | null;
  status: UploadStatus;
  /** Only on the create answer (and while `waiting`). */
  url: string | null;
}

export function toMuxUpload(
  data: z.infer<typeof muxUploadDataSchema>
): MuxUpload {
  return {
    assetId: data.asset_id ?? null,
    error: data.error ? (data.error.message ?? data.error.type ?? null) : null,
    id: data.id,
    passthrough: data.new_asset_settings?.passthrough ?? null,
    status: data.status,
    url: data.url ?? null,
  };
}

export interface DirectUploadOptions {
  /** The site origin (never `*`): the only origin the upload URL's CORS allows. */
  corsOrigin: string;
  /** `gesture-upload:<uuid>`; the asset carries it into the webhooks. */
  passthrough: string;
  /** A test upload (watermarked, deleted after 24 h): dev only. */
  test: boolean;
}

/**
 * `POST /video/v1/uploads` with the settings of ruling 4: public playback,
 * the highest static rendition (phase 7's renders read it), the
 * passthrough, the site origin as `cors_origin` and the default timeout.
 */
export async function createDirectUpload(
  mux: Mux,
  { corsOrigin, passthrough, test }: DirectUploadOptions
): Promise<MuxUpload & { url: string }> {
  const upload = toMuxUpload(
    await muxRequest(mux, "/video/v1/uploads", {
      body: {
        cors_origin: corsOrigin,
        new_asset_settings: {
          passthrough,
          playback_policies: ["public"],
          static_renditions: [{ resolution: "highest" }],
        },
        ...(test ? { test: true } : {}),
        timeout: UPLOAD_TIMEOUT_SECONDS,
      },
      method: "POST",
      schema: muxUploadDataSchema,
    })
  );
  if (!upload.url) {
    throw new Error("[video] Mux created an upload without a URL");
  }
  return { ...upload, url: upload.url };
}

/** `GET /video/v1/uploads/:id`, or `null` when Mux does not know it. */
export async function getUpload(
  mux: Mux,
  id: string
): Promise<MuxUpload | null> {
  const data = await muxRequest(
    mux,
    `/video/v1/uploads/${encodeURIComponent(id)}`,
    { nullOn404: true, schema: muxUploadDataSchema }
  );
  return data ? toMuxUpload(data) : null;
}

/** A 4xx a cancel can get for an upload that is past `waiting` (not auth, not a rate limit). */
function isRefusal(error: unknown): boolean {
  return (
    error instanceof MuxApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 403 &&
    error.status !== 429
  );
}

/** What `cancelUpload` found. */
export interface CancelUploadResult {
  /**
   * The upload's asset when it already had one (`already-final`). Nobody
   * else will delete it: the caller must (phase 7 task 5 review, I-3).
   */
  assetId: string | null;
  state: "cancelled" | "already-final";
}

/**
 * `PUT /video/v1/uploads/:id/cancel`. Mux cancels only an upload that is
 * still `waiting` (then no asset is ever created from it), so:
 * - `cancelled`: Mux cancelled it;
 * - `already-final`: Mux does not know it (404), or refused the cancel and
 *   the upload is indeed past `waiting` (`asset_created`, errored,
 *   cancelled, timed out). `assetId` is its asset, if any, which the
 *   caller deletes.
 *
 * Anything else (an outage, 401/403/429, a refusal while still `waiting`)
 * throws.
 */
export async function cancelUpload(
  mux: Mux,
  uploadId: string
): Promise<CancelUploadResult> {
  const path = `/video/v1/uploads/${encodeURIComponent(uploadId)}/cancel`;
  try {
    const data = await muxRequest(mux, path, {
      method: "PUT",
      nullOn404: true,
      schema: muxUploadDataSchema,
    });
    return {
      assetId: data?.asset_id ?? null,
      state: data?.status === "cancelled" ? "cancelled" : "already-final",
    };
  } catch (error) {
    if (!isRefusal(error)) {
      throw error;
    }
    const upload = await getUpload(mux, uploadId);
    if (upload === null || upload.status !== "waiting") {
      console.log(
        `[video] Upload ${uploadId} is ${upload?.status ?? "unknown"}: nothing to cancel`
      );
      return { assetId: upload?.assetId ?? null, state: "already-final" };
    }
    throw error;
  }
}
