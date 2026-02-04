import Mux from "@mux/mux-node";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export interface UploadVideoOptions {
  videoUrl: string;
  gestureId: string;
}

export interface MuxAssetStatus {
  id: string;
  status: "preparing" | "ready" | "errored";
  playbackId?: string;
}

export interface MasterAccessUrl {
  url: string;
  expiresAt: Date;
}

/**
 * Upload a video to MUX and return the playback ID
 * @param options Video URL and metadata
 * @returns MUX playback ID
 */
export async function uploadVideoToMux(
  options: UploadVideoOptions
): Promise<string> {
  try {
    console.log("[MUX] Creating asset from URL:", options.videoUrl);

    // Create MUX asset from URL with master access enabled for secure downloads
    const asset = await mux.video.assets.create({
      inputs: [{ url: options.videoUrl }],
      playback_policy: ["public"],
      mp4_support: "standard",
      master_access: "temporary",
      test: process.env.NODE_ENV === "development",
    });

    console.log("[MUX] Asset created:", asset.id);

    // Wait for asset to be ready (poll every 2 seconds, max 5 minutes)
    let assetStatus = asset;
    const maxAttempts = 150; // 5 minutes
    let attempts = 0;

    while (assetStatus.status !== "ready" && attempts < maxAttempts) {
      if (assetStatus.status === "errored") {
        throw new Error(
          `MUX asset processing failed: ${JSON.stringify(assetStatus.errors)}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      assetStatus = await mux.video.assets.retrieve(asset.id);
      attempts++;

      console.log(
        `[MUX] Asset status: ${assetStatus.status} (attempt ${attempts}/${maxAttempts})`
      );
    }

    if (assetStatus.status !== "ready") {
      throw new Error(
        `MUX asset processing timeout after ${maxAttempts * 2} seconds`
      );
    }

    const playbackId = assetStatus.playback_ids?.[0]?.id;
    if (!playbackId) {
      throw new Error("MUX asset has no playback ID");
    }

    console.log("[MUX] Asset ready with playback ID:", playbackId);
    return playbackId;
  } catch (error) {
    console.error("[MUX] Upload error:", error);
    throw error;
  }
}

/**
 * Delete a video from MUX by playback ID
 * @param playbackId MUX playback ID
 */
export async function deleteVideoFromMux(playbackId: string): Promise<void> {
  try {
    console.log("[MUX] Finding asset for playback ID:", playbackId);

    // List all assets and find the one with matching playback ID
    const assets = await mux.video.assets.list({ limit: 100 });
    const asset = assets.data.find((a) =>
      a.playback_ids?.some((p) => p.id === playbackId)
    );

    if (!asset) {
      console.warn("[MUX] Asset not found for playback ID:", playbackId);
      return;
    }

    console.log("[MUX] Deleting asset:", asset.id);
    await mux.video.assets.delete(asset.id);
    console.log("[MUX] Asset deleted successfully");
  } catch (error) {
    console.error("[MUX] Delete error:", error);
    // Don't throw - deletion is best-effort
  }
}

/**
 * Get asset status by ID
 * @param assetId MUX asset ID
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
    console.error("[MUX] Get asset status error:", error);
    throw error;
  }
}

/**
 * Get asset ID from playback ID
 * @param playbackId MUX playback ID
 * @returns Asset ID
 */
export async function getAssetIdFromPlaybackId(
  playbackId: string
): Promise<string> {
  try {
    console.log("[MUX] Finding asset ID for playback ID:", playbackId);

    // Search through pages of assets to find the matching playback ID
    let page = 1;
    const limit = 100;
    const maxPages = 10; // Search up to 1000 assets

    while (page <= maxPages) {
      console.log(`[MUX] Searching assets page ${page}...`);
      const assets = await mux.video.assets.list({ limit, page });

      const asset = assets.data.find((a) =>
        a.playback_ids?.some((p) => p.id === playbackId)
      );

      if (asset) {
        console.log("[MUX] Found asset ID:", asset.id);
        return asset.id;
      }

      // If we got fewer results than the limit, we've reached the end
      if (assets.data.length < limit) {
        break;
      }

      page++;
    }

    throw new Error(
      `Asset not found for playback ID: ${playbackId} (searched ${page * limit} assets)`
    );
  } catch (error) {
    console.error("[MUX] Get asset ID error:", error);
    throw error;
  }
}

/**
 * Enable master access for an asset if not already enabled
 * @param assetId MUX asset ID
 */
export async function enableMasterAccess(assetId: string): Promise<void> {
  try {
    console.log("[MUX] Enabling master access for asset:", assetId);

    // Check current master access status
    const asset = await mux.video.assets.retrieve(assetId);

    if (asset.master_access === "temporary") {
      console.log("[MUX] Master access already enabled");
      return;
    }

    // Enable master access
    await mux.video.assets.updateMasterAccess(assetId, {
      master_access: "temporary",
    });

    console.log("[MUX] Master access enabled successfully");
  } catch (error) {
    console.error("[MUX] Enable master access error:", error);
    throw error;
  }
}

/**
 * Get master download URL for a playback ID
 * This function ensures master access is enabled and returns a temporary download URL
 * The URL expires after 24 hours
 * @param playbackId MUX playback ID
 * @returns Temporary master download URL
 */
export async function getMasterDownloadUrl(
  playbackId: string
): Promise<MasterAccessUrl> {
  try {
    console.log(
      "[MUX] Getting master download URL for playback ID:",
      playbackId
    );

    // Step 1: Get asset ID from playback ID
    const assetId = await getAssetIdFromPlaybackId(playbackId);

    // Step 2: Enable master access if not already enabled
    await enableMasterAccess(assetId);

    // Step 3: Wait for master to be ready (poll with timeout)
    const maxAttempts = 30; // 1 minute (30 attempts * 2 seconds)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const asset = await mux.video.assets.retrieve(assetId);

      // Check if master is ready
      if (asset.master?.status === "ready" && asset.master?.url) {
        console.log("[MUX] Master download URL ready");

        // Master URLs expire after 24 hours
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        return {
          url: asset.master.url,
          expiresAt,
        };
      }

      if (asset.master?.status === "errored") {
        throw new Error("Master access preparation failed");
      }

      // Master is still preparing, wait and retry
      console.log(
        `[MUX] Master status: ${asset.master?.status || "preparing"} (attempt ${attempts + 1}/${maxAttempts})`
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }

    throw new Error(
      `Timeout waiting for master download URL after ${maxAttempts * 2} seconds`
    );
  } catch (error) {
    console.error("[MUX] Get master download URL error:", error);
    throw error;
  }
}

// =============================================================================
// Admin Functions for Asset Management
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

    console.log(`[MUX] Listing assets page ${page} (limit ${limit})`);

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
    console.error("[MUX] List assets error:", error);
    throw error;
  }
}

/**
 * Create a direct upload URL for browser file uploads
 * The client can PUT a file directly to this URL
 */
export async function createMuxDirectUpload(): Promise<DirectUploadResult> {
  try {
    console.log("[MUX] Creating direct upload URL");

    const upload = await mux.video.uploads.create({
      cors_origin: "*",
      new_asset_settings: {
        playback_policy: ["public"],
        mp4_support: "standard",
        master_access: "temporary",
        test: process.env.NODE_ENV === "development",
      },
    });

    console.log("[MUX] Direct upload created:", upload.id);

    return {
      uploadId: upload.id,
      uploadUrl: upload.url,
    };
  } catch (error) {
    console.error("[MUX] Create direct upload error:", error);
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
    console.log("[MUX] Getting upload status:", uploadId);

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
    console.error("[MUX] Get upload status error:", error);
    throw error;
  }
}

/**
 * Upload a video from a URL (async version that doesn't wait for processing)
 * Returns the asset ID immediately, caller can poll for status
 */
export async function uploadVideoFromUrl(videoUrl: string): Promise<{
  assetId: string;
  playbackId?: string;
}> {
  try {
    console.log("[MUX] Creating asset from URL (async):", videoUrl);

    const asset = await mux.video.assets.create({
      inputs: [{ url: videoUrl }],
      playback_policy: ["public"],
      mp4_support: "standard",
      master_access: "temporary",
      test: process.env.NODE_ENV === "development",
    });

    console.log("[MUX] Asset created:", asset.id);

    return {
      assetId: asset.id,
      playbackId: asset.playback_ids?.[0]?.id,
    };
  } catch (error) {
    console.error("[MUX] Upload from URL error:", error);
    throw error;
  }
}
