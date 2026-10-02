import { z } from "zod";
import { muxAssetDataSchema, publicPlaybackId } from "./assets";
import { ASSET_STATUSES, UPLOAD_STATUSES } from "./schema";
import { isGestureUpload, muxUploadDataSchema } from "./uploads";
import type { MuxEvent } from "./webhooks";

/**
 * What the webhook learned about a gesture upload, in KV under
 * `mux:upload:<uploadId>` for 24 h. `admin.mux.uploadStatus` reads it
 * first and asks the Mux API only while it is not final.
 */
const muxUploadStateSchema = z.object({
  asset: z
    .object({
      id: z.string(),
      playbackId: z.string().optional(),
      status: z.enum(ASSET_STATUSES),
    })
    .optional(),
  error: z.string().optional(),
  /** Milliseconds since the epoch. */
  updatedAt: z.number(),
  upload: z.enum(UPLOAD_STATUSES),
  uploadId: z.string(),
});

export type MuxUploadState = z.infer<typeof muxUploadStateSchema>;

export const UPLOAD_STATE_TTL_SECONDS = 24 * 60 * 60;

export function uploadStateKey(uploadId: string): string {
  return `mux:upload:${uploadId}`;
}

/** The KV key that marks a webhook event as handled (idempotency). */
export function muxEventKey(eventId: string): string {
  return `mux:event:${eventId}`;
}

/** The part of a KV binding this package uses (workerd's `KVNamespace` fits). */
export interface MuxKv {
  delete: (key: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ) => Promise<void>;
}

export async function readUploadState(
  kv: Pick<MuxKv, "get">,
  uploadId: string
): Promise<MuxUploadState | null> {
  const raw = await kv.get(uploadStateKey(uploadId));
  if (raw === null) {
    return null;
  }
  try {
    const parsed = muxUploadStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeUploadState(
  kv: Pick<MuxKv, "put">,
  state: MuxUploadState
): Promise<void> {
  await kv.put(uploadStateKey(state.uploadId), JSON.stringify(state), {
    expirationTtl: UPLOAD_STATE_TTL_SECONDS,
  });
}

type AssetState = NonNullable<MuxUploadState["asset"]>;

/** A settled asset (ready or errored) never goes back to preparing. */
function mergeAsset(
  previous: AssetState | undefined,
  next: AssetState
): AssetState {
  if (previous && previous.id === next.id && previous.status !== "preparing") {
    return previous;
  }
  return next;
}

function base(
  previous: MuxUploadState | null,
  uploadId: string,
  now: number
): MuxUploadState {
  return {
    ...(previous ?? { upload: "waiting" as const }),
    updatedAt: now,
    uploadId,
  };
}

function fromUploadEvent(
  previous: MuxUploadState | null,
  event: MuxEvent,
  now: number
): MuxUploadState | null {
  const parsed = muxUploadDataSchema.safeParse(event.data);
  if (
    !(
      parsed.success &&
      isGestureUpload(parsed.data.new_asset_settings?.passthrough)
    )
  ) {
    return null;
  }
  const upload = parsed.data;
  const state = base(previous, upload.id, now);
  if (event.type === "video.upload.asset_created") {
    const assetId = upload.asset_id;
    return {
      ...state,
      upload: "asset_created",
      ...(assetId
        ? {
            asset: mergeAsset(state.asset, {
              id: assetId,
              status: "preparing",
            }),
          }
        : {}),
    };
  }
  const message = upload.error?.message ?? upload.error?.type;
  return {
    ...state,
    upload: event.type === "video.upload.errored" ? "errored" : "cancelled",
    ...(message ? { error: message } : {}),
  };
}

function fromAssetEvent(
  previous: MuxUploadState | null,
  event: MuxEvent,
  now: number
): MuxUploadState | null {
  const parsed = muxAssetDataSchema.safeParse(event.data);
  if (!(parsed.success && isGestureUpload(parsed.data.passthrough))) {
    return null;
  }
  const asset = parsed.data;
  if (!asset.upload_id) {
    return null;
  }
  const state = base(previous, asset.upload_id, now);
  if (event.type === "video.asset.ready") {
    const playbackId = publicPlaybackId(asset.playback_ids);
    return {
      ...state,
      asset: mergeAsset(state.asset, {
        id: asset.id,
        status: "ready",
        ...(playbackId ? { playbackId } : {}),
      }),
      upload: "asset_created",
    };
  }
  const message =
    asset.errors?.messages?.join(" ") || asset.errors?.type || undefined;
  return {
    ...state,
    asset: mergeAsset(state.asset, { id: asset.id, status: "errored" }),
    upload: "asset_created",
    ...(message ? { error: message } : {}),
  };
}

/**
 * The upload's next state after `event`, or `null` when the event is not
 * about a gesture upload (another type, another passthrough, no upload id).
 */
export function applyMuxEvent(
  previous: MuxUploadState | null,
  event: MuxEvent,
  now: number
): MuxUploadState | null {
  switch (event.type) {
    case "video.upload.asset_created":
    case "video.upload.errored":
    case "video.upload.cancelled":
      return fromUploadEvent(previous, event, now);
    case "video.asset.ready":
    case "video.asset.errored":
      return fromAssetEvent(previous, event, now);
    default:
      return null;
  }
}

/** The upload id an event is about, for reading its previous state. */
export function eventUploadId(event: MuxEvent): string | null {
  const { id, upload_id: uploadId } = event.data;
  const value = event.type.startsWith("video.upload.") ? id : uploadId;
  return typeof value === "string" ? value : null;
}
