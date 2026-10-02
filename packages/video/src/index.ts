// biome-ignore-all lint/performance/noBarrelFile: the `@smog/video` entry point (Worker only: it holds the Mux credentials' client).
/**
 * `@smog/video`: the Mux Video helpers (spec §8.2). A thin `fetch` client
 * (no SDK; DECISIONS, phase 5 task 3), direct uploads, upload and asset
 * lookups, the asset list, webhook verification and the webhook handler.
 * Never imported by client code: it is the only place the Mux token is
 * used. Phase 7 adds master access and the render upload.
 */

export {
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
export { handleMuxWebhook, MUX_WEBHOOK_MAX_BYTES } from "./webhook-handler";
export {
  type MuxEvent,
  MuxSignatureError,
  verifyMuxWebhook,
} from "./webhooks";
