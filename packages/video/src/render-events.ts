import { muxAssetDataSchema, publicPlaybackId } from "./assets";
import { muxUploadDataSchema, renderJobIdOf } from "./uploads";
import type { MuxEvent } from "./webhooks";

/** The Mux events a render job's Workflow waits for (phase 7 ruling 9). */
export const RENDER_MUX_EVENT_TYPES = [
  "asset.ready",
  "asset.errored",
  "upload.errored",
  "upload.cancelled",
] as const;

export type RenderMuxEventType = (typeof RENDER_MUX_EVENT_TYPES)[number];

/**
 * A verified Mux event about a render job's upload (`render-job:<id>`
 * passthrough), small and JSON-safe: the site sends it as the Workflow
 * event `mux-asset-<uploadId>`'s payload. It holds no signed URL.
 */
export interface RenderMuxEvent {
  assetId?: string;
  /** Mux's message for an errored asset or upload. */
  error?: string;
  /** The asset's first public playback id (`asset.ready`). */
  playbackId?: string;
  renderJobId: string;
  type: RenderMuxEventType;
  uploadId: string;
}

function fromAsset(
  type: "asset.ready" | "asset.errored",
  event: MuxEvent
): RenderMuxEvent | null {
  const parsed = muxAssetDataSchema.safeParse(event.data);
  if (!parsed.success) {
    return null;
  }
  const asset = parsed.data;
  const renderJobId = renderJobIdOf(asset.passthrough);
  if (!(renderJobId && asset.upload_id)) {
    return null;
  }
  const playbackId =
    type === "asset.ready" ? publicPlaybackId(asset.playback_ids) : null;
  const error =
    type === "asset.errored"
      ? asset.errors?.messages?.join(" ") || asset.errors?.type || null
      : null;
  return {
    assetId: asset.id,
    renderJobId,
    type,
    uploadId: asset.upload_id,
    ...(playbackId ? { playbackId } : {}),
    ...(error ? { error } : {}),
  };
}

function fromUpload(
  type: "upload.errored" | "upload.cancelled",
  event: MuxEvent
): RenderMuxEvent | null {
  const parsed = muxUploadDataSchema.safeParse(event.data);
  if (!parsed.success) {
    return null;
  }
  const upload = parsed.data;
  const renderJobId = renderJobIdOf(upload.new_asset_settings?.passthrough);
  if (!renderJobId) {
    return null;
  }
  const error = upload.error?.message || upload.error?.type || null;
  return {
    renderJobId,
    type,
    uploadId: upload.id,
    ...(upload.asset_id ? { assetId: upload.asset_id } : {}),
    ...(error ? { error } : {}),
  };
}

/**
 * The render event in a verified Mux event, or `null` when it is not one:
 * another passthrough, another type (`video.upload.asset_created` and
 * `video.asset.master.ready` are not routed, ruling 9) or a body that does
 * not read.
 */
export function toRenderMuxEvent(event: MuxEvent): RenderMuxEvent | null {
  switch (event.type) {
    case "video.asset.ready":
      return fromAsset("asset.ready", event);
    case "video.asset.errored":
      return fromAsset("asset.errored", event);
    case "video.upload.errored":
      return fromUpload("upload.errored", event);
    case "video.upload.cancelled":
      return fromUpload("upload.cancelled", event);
    default:
      return null;
  }
}
