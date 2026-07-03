/**
 * Mux service for video download and upload operations
 */

import * as fs from "node:fs/promises";
import Mux from "@mux/mux-node";

let muxClient: Mux | null = null;

function getMuxClient(): Mux {
  if (!muxClient) {
    const tokenId = process.env.MUX_TOKEN_ID;
    const tokenSecret = process.env.MUX_TOKEN_SECRET;
    if (!(tokenId && tokenSecret)) {
      throw new Error("MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set");
    }
    muxClient = new Mux({
      tokenId,
      tokenSecret,
    });
  }
  return muxClient;
}

/**
 * Get the video source URL for a Mux playback ID
 * This requests a temporary master download URL from the server
 */
export async function getVideoSourceUrl(playbackId: string): Promise<string> {
  console.log(`[Mux] Getting source URL for playback ID: ${playbackId}`);

  const serverUrl = process.env.SERVER_URL || "http://localhost:3000";
  const apiKey = process.env.REMOTION_API_KEY;
  if (!apiKey) {
    throw new Error("REMOTION_API_KEY must be set");
  }
  const response = await fetch(`${serverUrl}/api/video/master-access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ playbackId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get master access URL: ${response.status} - ${errorText}`
    );
  }

  const { url } = (await response.json()) as { url: string; expiresAt: string };
  return url;
}

/**
 * Upload a video file to Mux and return the playback ID
 */
export async function uploadToMux(
  videoPath: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const client = getMuxClient();

  console.log("[Mux] Creating direct upload...");
  onProgress?.(80);

  // Create direct upload
  const upload = await client.video.uploads.create({
    new_asset_settings: {
      playback_policy: ["public"],
      master_access: "temporary",
      test: process.env.NODE_ENV === "development",
    },
    cors_origin: "*",
  });

  console.log(`[Mux] Direct upload created: ${upload.id}`);
  onProgress?.(82);
  if (!upload.url) {
    throw new Error("Mux did not return a direct upload URL");
  }

  // Read and upload the video file
  const videoBuffer = await fs.readFile(videoPath);
  const stats = await fs.stat(videoPath);
  console.log(
    `[Mux] Uploading file: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
  );

  const uploadResponse = await fetch(upload.url, {
    method: "PUT",
    body: videoBuffer,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": stats.size.toString(),
    },
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
  }

  console.log("[Mux] Video file uploaded successfully");
  onProgress?.(90);

  // Wait for asset creation
  const assetId = await waitForAssetCreation(client, upload.id);
  console.log(`[Mux] Asset created: ${assetId}`);
  onProgress?.(95);

  // Wait for asset to be ready
  const playbackId = await waitForAssetReady(client, assetId);
  console.log(`[Mux] Video ready with playback ID: ${playbackId}`);
  onProgress?.(100);

  return playbackId;
}

async function waitForAssetCreation(
  client: Mux,
  uploadId: string,
  maxAttempts = 150
): Promise<string> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const uploadStatus = await client.video.uploads.retrieve(uploadId);

    if (uploadStatus.asset_id) {
      return uploadStatus.asset_id;
    }

    attempts++;
    if (attempts % 10 === 0) {
      console.log(
        `[Mux] Waiting for asset creation (${attempts}/${maxAttempts})...`
      );
    }
  }

  throw new Error("Asset creation timeout after 5 minutes");
}

async function waitForAssetReady(
  client: Mux,
  assetId: string,
  maxAttempts = 150
): Promise<string> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const asset = await client.video.assets.retrieve(assetId);

    if (asset.status === "errored") {
      throw new Error(
        `Mux asset processing failed: ${JSON.stringify(asset.errors)}`
      );
    }

    if (asset.status === "ready") {
      const playbackId = asset.playback_ids?.[0]?.id;
      if (!playbackId) {
        throw new Error("Asset has no playback ID");
      }
      return playbackId;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts++;
    if (attempts % 10 === 0) {
      console.log(
        `[Mux] Asset status: ${asset.status} (${attempts}/${maxAttempts})`
      );
    }
  }

  throw new Error("Asset processing timeout after 5 minutes");
}
