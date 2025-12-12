import Mux from "@mux/mux-node";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export type UploadVideoOptions = {
  videoUrl: string;
  gestureId: string;
};

export type MuxAssetStatus = {
  id: string;
  status: "preparing" | "ready" | "errored";
  playbackId?: string;
};

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

    // Create MUX asset from URL
    const asset = await mux.video.assets.create({
      inputs: [{ url: options.videoUrl }],
      playback_policy: ["public"],
      mp4_support: "standard",
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
