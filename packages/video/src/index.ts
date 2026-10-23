// biome-ignore-all lint/performance/noBarrelFile: the `@smog/video` entry point (Worker only: it holds the Mux credentials' client).
/**
 * `@smog/video`: the Mux Video helpers (spec §8.2). A thin `fetch` client
 * (no SDK; DECISIONS, phase 5 task 3), direct uploads, upload and asset
 * lookups, the asset list, webhook verification and the webhook handler.
 * Never imported by client code: it is the only place the Mux token is
 * used. The render helpers of phases 7 and 8 (master access, the render
 * upload, the render-job webhook events) are gone with the render pipeline
 * (phase 10b task 9); the playback-id lookup and the static renditions stay
 * for the importer.
 */

export {
  deleteAsset,
  getAsset,
  listAssets,
  type MuxAsset,
  type MuxAssetSummary,
  type StaticRenditionFile,
  type StaticRenditions,
} from "./assets";
export {
  createMux,
  type Mux,
  MuxApiError,
  type MuxEnv,
  type MuxFetch,
} from "./client";
export { assetIdForPlayback } from "./master";
export {
  enableStaticRendition,
  STATIC_RENDITION_STATES,
  type StaticRenditionResolution,
  type StaticRenditionState,
  staticRenditionState,
} from "./static-renditions";
export {
  type MuxKv,
  type MuxUploadState,
  readUploadState,
} from "./upload-state";
export {
  createDirectUpload,
  GESTURE_UPLOAD_PREFIX,
  gestureUploadPassthrough,
  getUpload,
  isGestureUpload,
  type MuxUpload,
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
