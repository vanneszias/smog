/**
 * Mux service for video download and upload operations
 * Handles all interactions with Mux API
 */

import * as fs from "node:fs/promises";
import Mux from "@mux/mux-node";
import {
  createDownloadError,
  createUploadError,
  VideoErrorCode,
  VideoProcessingError,
} from "../types/errors";
import { formatFileSize, getFileSize } from "../utils/filesystem";

export type MuxCredentials = {
  tokenId: string;
  tokenSecret: string;
};

export type MuxDownloadOptions = {
  playbackId: string;
  destination: string;
  serverUrl?: string;
  apiKey?: string;
};

export type MuxUploadOptions = {
  videoPath: string;
  isDevelopment?: boolean;
};

export class MuxService {
  private readonly client: Mux;
  private readonly serverUrl: string;
  private readonly apiKey: string;

  constructor(credentials: MuxCredentials) {
    this.client = new Mux({
      tokenId: credentials.tokenId,
      tokenSecret: credentials.tokenSecret,
    });
    this.serverUrl = process.env.SERVER_URL || "http://server:3000";
    this.apiKey = process.env.VIDEO_WORKER_API_KEY || "dev-secret-key";
  }

  /**
   * Download video from Mux using secure master access
   * Requests a temporary download URL from the server API
   */
  async downloadVideo(options: MuxDownloadOptions): Promise<void> {
    console.log(
      `[MuxService] Downloading video with playback ID: ${options.playbackId}`
    );

    try {
      // Step 1: Get temporary master download URL from server API
      const masterAccessUrl = await this.getMasterAccessUrl(options.playbackId);
      console.log("[MuxService] Got temporary master URL");

      // Step 2: Download video from temporary URL
      const response = await fetch(masterAccessUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download video: ${response.status} ${response.statusText}`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(options.destination, Buffer.from(arrayBuffer));

      const size = await getFileSize(options.destination);
      console.log(`[MuxService] Downloaded video: ${formatFileSize(size)}`);
    } catch (error) {
      throw createDownloadError(
        options.playbackId,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get temporary master access URL from server
   */
  private async getMasterAccessUrl(playbackId: string): Promise<string> {
    const response = await fetch(`${this.serverUrl}/api/video/master-access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ playbackId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new VideoProcessingError(VideoErrorCode.MASTER_ACCESS_DENIED, {
        message: `Failed to get master access URL: ${response.status} ${response.statusText}`,
        suggestion: "Verify API credentials and playback ID",
        metadata: { playbackId, errorText },
      });
    }

    const { url, expiresAt } = (await response.json()) as {
      url: string;
      expiresAt: string;
    };

    console.log(`[MuxService] Master URL expires: ${expiresAt}`);
    return url;
  }

  /**
   * Upload composed video to Mux using direct upload
   */
  async uploadVideo(options: MuxUploadOptions): Promise<string> {
    console.log("[MuxService] Uploading video to Mux...");

    try {
      // Step 1: Create direct upload
      const upload = await this.client.video.uploads.create({
        new_asset_settings: {
          playback_policy: ["public"],
          master_access: "temporary",
          test: Boolean(options.isDevelopment),
        },
        cors_origin: "*",
      });

      console.log(`[MuxService] Direct upload created: ${upload.id}`);

      // Step 2: Upload video file
      const videoBuffer = await fs.readFile(options.videoPath);
      const size = await getFileSize(options.videoPath);
      console.log(`[MuxService] Uploading file: ${formatFileSize(size)}`);

      const uploadResponse = await fetch(upload.url, {
        method: "PUT",
        body: videoBuffer,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": size.toString(),
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(
          `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`
        );
      }

      console.log("[MuxService] Video file uploaded successfully");

      // Step 3: Wait for asset creation
      const assetId = await this.waitForAssetCreation(upload.id);
      console.log(`[MuxService] Asset created: ${assetId}`);

      // Step 4: Wait for asset to be ready
      const playbackId = await this.waitForAssetReady(assetId);
      console.log(`[MuxService] Video ready with playback ID: ${playbackId}`);

      return playbackId;
    } catch (error) {
      throw createUploadError(
        error instanceof Error ? error.message : "Unknown error",
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Wait for asset to be created from upload
   */
  private async waitForAssetCreation(
    uploadId: string,
    maxAttempts = 150
  ): Promise<string> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const uploadStatus = await this.client.video.uploads.retrieve(uploadId);

      if (uploadStatus.asset_id) {
        return uploadStatus.asset_id;
      }

      attempts++;
      console.log(
        `[MuxService] Waiting for asset creation (${attempts}/${maxAttempts})...`
      );
    }

    throw new VideoProcessingError(VideoErrorCode.ASSET_CREATION_TIMEOUT, {
      message: "Asset creation timeout after 5 minutes",
      suggestion: "Check Mux dashboard for upload status",
      metadata: { uploadId },
    });
  }

  /**
   * Wait for asset to be ready for playback
   */
  private async waitForAssetReady(
    assetId: string,
    maxAttempts = 150
  ): Promise<string> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const asset = await this.client.video.assets.retrieve(assetId);

      if (asset.status === "errored") {
        throw new VideoProcessingError(VideoErrorCode.ASSET_PROCESSING_FAILED, {
          message: "Mux asset processing failed",
          suggestion: "Check Mux dashboard for error details",
          metadata: { assetId, errors: asset.errors },
        });
      }

      if (asset.status === "ready") {
        const playbackId = asset.playback_ids?.[0]?.id;
        if (!playbackId) {
          throw new VideoProcessingError(VideoErrorCode.UPLOAD_FAILED, {
            message: "Asset has no playback ID",
            suggestion: "Check asset configuration in Mux",
            metadata: { assetId },
          });
        }
        return playbackId;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
      console.log(
        `[MuxService] Asset status: ${asset.status} (${attempts}/${maxAttempts})`
      );
    }

    throw new VideoProcessingError(VideoErrorCode.ASSET_CREATION_TIMEOUT, {
      message: "Asset processing timeout after 5 minutes",
      suggestion: "Check Mux dashboard for asset status",
      metadata: { assetId },
    });
  }
}
