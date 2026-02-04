import Mux from "@mux/mux-node";

const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID;
const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET;

if (!(MUX_TOKEN_ID && MUX_TOKEN_SECRET)) {
  throw new Error(
    "MUX_TOKEN_ID and MUX_TOKEN_SECRET environment variables are required"
  );
}

const mux = new Mux({
  tokenId: MUX_TOKEN_ID,
  tokenSecret: MUX_TOKEN_SECRET,
});

// =============================================================================
// Types
// =============================================================================

export interface MuxAssetListItem {
  id: string;
  playbackId: string;
  status: "preparing" | "ready" | "errored";
  duration?: number;
  aspectRatio?: string;
  createdAt: string;
}

export interface ListMuxAssetsResult {
  assets: MuxAssetListItem[];
  hasMore: boolean;
}

export interface DirectUploadResult {
  uploadId: string;
  uploadUrl: string;
}

export interface UploadStatus {
  id: string;
  status: "waiting" | "asset_created" | "errored" | "cancelled" | "timed_out";
  assetId?: string;
  playbackId?: string;
  error?: string;
}

export interface MuxAssetStatus {
  id: string;
  status: "preparing" | "ready" | "errored";
  playbackId?: string;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * List all Mux video assets with pagination
 * Returns assets with public playback IDs that are ready for use
 */
export async function listMuxAssets(options?: {
  limit?: number;
  page?: number;
}): Promise<ListMuxAssetsResult> {
  try {
    const limit = options?.limit || 20;
    const page = options?.page || 1;

    console.log(`[mux] Listing assets page ${page} (limit ${limit})`);

    const response = await mux.video.assets.list({ limit: limit + 1, page });

    const assets: MuxAssetListItem[] = response.data
      .slice(0, limit)
      .filter((asset) => asset.playback_ids?.some((p) => p.policy === "public"))
      .map((asset) => ({
        id: asset.id,
        playbackId: asset.playback_ids?.find((p) => p.policy === "public")
          ?.id as string,
        status: asset.status as "preparing" | "ready" | "errored",
        duration: asset.duration,
        aspectRatio: asset.aspect_ratio,
        createdAt: asset.created_at,
      }));

    return {
      assets,
      hasMore: response.data.length > limit,
    };
  } catch (error) {
    console.error("[mux] List assets error:", error);
    throw error;
  }
}

/**
 * Create a direct upload URL for browser file uploads
 * The client can PUT a file directly to this URL
 */
export async function createMuxDirectUpload(): Promise<DirectUploadResult> {
  try {
    console.log("[mux] Creating direct upload URL");

    const upload = await mux.video.uploads.create({
      cors_origin: "*",
      new_asset_settings: {
        playback_policy: ["public"],
        mp4_support: "standard",
        master_access: "temporary",
        test: process.env.NODE_ENV === "development",
      },
    });

    console.log("[mux] Direct upload created:", upload.id);

    return {
      uploadId: upload.id,
      uploadUrl: upload.url,
    };
  } catch (error) {
    console.error("[mux] Create direct upload error:", error);
    throw error;
  }
}

/**
 * Get the status of a direct upload and its resulting asset
 */
export async function getMuxUploadStatus(
  uploadId: string
): Promise<UploadStatus> {
  try {
    console.log("[mux] Getting upload status:", uploadId);

    const upload = await mux.video.uploads.retrieve(uploadId);

    const result: UploadStatus = {
      id: upload.id,
      status: upload.status as UploadStatus["status"],
    };

    if (upload.asset_id) {
      result.assetId = upload.asset_id;

      // Get the asset to retrieve the playback ID
      const asset = await mux.video.assets.retrieve(upload.asset_id);
      result.playbackId = asset.playback_ids?.find(
        (p) => p.policy === "public"
      )?.id;
    }

    if (upload.error) {
      result.error =
        upload.error.type || upload.error.message || "Upload failed";
    }

    return result;
  } catch (error) {
    console.error("[mux] Get upload status error:", error);
    throw error;
  }
}

/**
 * Get asset status by ID
 */
export async function getAssetStatus(assetId: string): Promise<MuxAssetStatus> {
  try {
    const asset = await mux.video.assets.retrieve(assetId);
    return {
      id: asset.id,
      status: asset.status as "preparing" | "ready" | "errored",
      playbackId: asset.playback_ids?.[0]?.id,
    };
  } catch (error) {
    console.error("[mux] Get asset status error:", error);
    throw error;
  }
}
