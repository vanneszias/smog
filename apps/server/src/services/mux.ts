import Mux from "@mux/mux-node";

export interface MasterAccessUrl {
  url: string;
  expiresAt: Date;
}

let muxClient: Mux | null = null;

function getMuxClient() {
  if (muxClient) {
    return muxClient;
  }

  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!(tokenId && tokenSecret)) {
    throw new Error("MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set");
  }

  muxClient = new Mux({ tokenId, tokenSecret });
  return muxClient;
}

async function getAssetIdFromPlaybackId(playbackId: string) {
  const mux = getMuxClient();
  const limit = 100;

  for (let page = 1; page <= 10; page++) {
    const assets = await mux.video.assets.list({ limit, page });
    const asset = assets.data.find((item) =>
      item.playback_ids?.some((playback) => playback.id === playbackId)
    );

    if (asset) {
      return asset.id;
    }
    if (assets.data.length < limit) {
      break;
    }
  }

  throw new Error(`Asset not found for playback ID: ${playbackId}`);
}

async function enableMasterAccess(assetId: string) {
  const mux = getMuxClient();
  const asset = await mux.video.assets.retrieve(assetId);
  if (asset.master_access !== "temporary") {
    await mux.video.assets.updateMasterAccess(assetId, {
      master_access: "temporary",
    });
  }
}

export async function deleteVideoFromMux(playbackId: string): Promise<void> {
  try {
    const mux = getMuxClient();
    const assetId = await getAssetIdFromPlaybackId(playbackId);
    await mux.video.assets.delete(assetId);
  } catch (error) {
    console.error("[MUX] Failed to delete video:", error);
  }
}

export async function getMasterDownloadUrl(
  playbackId: string
): Promise<MasterAccessUrl> {
  const mux = getMuxClient();
  const assetId = await getAssetIdFromPlaybackId(playbackId);
  await enableMasterAccess(assetId);

  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const asset = await mux.video.assets.retrieve(assetId);
    if (asset.master?.status === "ready" && asset.master.url) {
      return {
        url: asset.master.url,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    }
    if (asset.master?.status === "errored") {
      throw new Error("Master access preparation failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Timed out waiting for the Mux master download URL");
}
