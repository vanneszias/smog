/**
 * `@smog/video/schema`: the Mux states and limits, without any client
 * code, so contracts and the admin UI can share them (the main entry is
 * Worker only: it holds the Mux client).
 */

/** A direct upload's states (Mux API). The asset id is set from `asset_created`. */
export const UPLOAD_STATUSES = [
  "waiting",
  "asset_created",
  "errored",
  "cancelled",
  "timed_out",
] as const;

export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

/** An asset's states (Mux API). */
export const ASSET_STATUSES = ["preparing", "ready", "errored"] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** The asset picker's page size cap. */
export const MUX_ASSETS_PAGE_MAX = 24;

/**
 * The upload is over and polling may stop: it failed (errored, cancelled,
 * timed out) or its asset settled (ready or errored).
 */
export function isFinalUpload(state: {
  asset?: { status: AssetStatus } | undefined;
  upload: UploadStatus;
}): boolean {
  if (state.upload !== "waiting" && state.upload !== "asset_created") {
    return true;
  }
  return state.asset?.status === "ready" || state.asset?.status === "errored";
}
