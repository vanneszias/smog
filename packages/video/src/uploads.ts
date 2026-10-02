import { z } from "zod";
import { type Mux, muxRequest } from "./client";
import { UPLOAD_STATUSES, type UploadStatus } from "./schema";

/** How long the signed upload URL stays valid (Mux's default; 60–604800). */
const UPLOAD_TIMEOUT_SECONDS = 3600;

/** The passthrough prefix of an admin gesture upload (phase 7 adds `render:`). */
export const GESTURE_UPLOAD_PREFIX = "gesture-upload:";

export function isGestureUpload(
  passthrough: string | null | undefined
): boolean {
  return passthrough?.startsWith(GESTURE_UPLOAD_PREFIX) ?? false;
}

/** A fresh `gesture-upload:<uuid>` passthrough. */
export function gestureUploadPassthrough(): string {
  return `${GESTURE_UPLOAD_PREFIX}${crypto.randomUUID()}`;
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

function toMuxUpload(data: z.infer<typeof muxUploadDataSchema>): MuxUpload {
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
