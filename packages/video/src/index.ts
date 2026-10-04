// biome-ignore-all lint/performance/noBarrelFile: the `@smog/video` entry point (Worker only: it holds the Mux credentials' client).
/**
 * `@smog/video`: the Mux Video helpers (spec §8.2). A thin `fetch` client
 * (no SDK; DECISIONS, phase 5 task 3), direct uploads, upload and asset
 * lookups, the asset list, webhook verification and the webhook handler.
 * Never imported by client code: it is the only place the Mux token is
 * used. Phase 7 adds what the render Workflow needs: the playback-id
 * lookup, master access, the render upload and its cancel, the rendition
 * fallback and the render-job webhook events.
 */

export {
  deleteAsset,
  getAsset,
  listAssets,
  type MuxAsset,
  type MuxAssetSummary,
} from "./assets";
export {
  createMux,
  type Mux,
  MuxApiError,
  type MuxEnv,
  type MuxFetch,
} from "./client";
export {
  assetIdForPlayback,
  enableMasterAccess,
  type MasterState,
  masterState,
} from "./master";
export {
  RENDER_MUX_EVENT_TYPES,
  type RenderMuxEvent,
  type RenderMuxEventType,
  toRenderMuxEvent,
} from "./render-events";
export { createRenderUpload, type RenderUploadOptions } from "./render-upload";
export { renditionUrls } from "./renditions";
export { firstReachable } from "./source";
export {
  type MuxKv,
  type MuxUploadState,
  readUploadState,
} from "./upload-state";
export {
  type CancelUploadResult,
  cancelUpload,
  createDirectUpload,
  GESTURE_UPLOAD_PREFIX,
  gestureUploadPassthrough,
  getUpload,
  isGestureUpload,
  type MuxUpload,
  RENDER_JOB_PREFIX,
  renderJobIdOf,
  renderJobPassthrough,
} from "./uploads";
export { isAllowedUploadUrl } from "./urls";
export {
  handleMuxWebhook,
  MUX_WEBHOOK_MAX_BYTES,
  type MuxWebhookOptions,
} from "./webhook-handler";
export {
  type MuxEvent,
  MuxSignatureError,
  verifyMuxWebhook,
} from "./webhooks";
