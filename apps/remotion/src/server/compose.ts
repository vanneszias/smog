/**
 * Video composition service using Remotion
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { OverlayConfig } from "@smog/types";
import {
  completeJob,
  type JobData,
  updateJobProgress,
  updateJobState,
} from "./jobs";
import { getVideoSourceUrl, uploadToMux } from "./mux";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache the bundle location to avoid re-bundling for each render
let bundleLocation: string | null = null;
let bundlePromise: Promise<string> | null = null;

async function getBundleLocation(): Promise<string> {
  if (bundleLocation) {
    return bundleLocation;
  }

  if (bundlePromise) {
    return bundlePromise;
  }

  bundlePromise = bundle({
    entryPoint: path.resolve(__dirname, "../index.ts"),
    onProgress: (percent) => {
      if (percent % 20 === 0) {
        console.log(`[Compose] Bundling Remotion project: ${percent}%`);
      }
    },
  });

  bundleLocation = await bundlePromise;
  console.log("[Compose] Remotion bundle ready");
  return bundleLocation;
}

// Pre-bundle on startup
getBundleLocation().catch((err) => {
  console.error("[Compose] Failed to pre-bundle:", err);
});

export async function processComposition(
  jobId: string,
  data: JobData
): Promise<void> {
  const { playbackId, overlayImageUrl, overlayText, overlayConfig } = data;

  try {
    updateJobState(jobId, "active");
    updateJobProgress(jobId, 5);

    console.log(
      `[Compose] Starting composition for playback ID: ${playbackId}`
    );

    // Get the video source URL from Mux
    updateJobProgress(jobId, 10);
    const videoSrc = await getVideoSourceUrl(playbackId);
    console.log("[Compose] Got video source URL");

    // Get the Remotion bundle
    updateJobProgress(jobId, 15);
    const serveUrl = await getBundleLocation();

    // Prepare input props for Remotion composition
    const inputProps = {
      videoSrc,
      sponsorName: overlayText,
      logoUrl: overlayImageUrl || undefined,
      overlayConfig: overlayConfig as OverlayConfig | undefined,
    };

    // Select the composition (this fetches video duration via calculateMetadata)
    updateJobProgress(jobId, 20);
    console.log("[Compose] Selecting composition and calculating metadata...");
    const composition = await selectComposition({
      serveUrl,
      id: "SponsoredVideo",
      inputProps,
    });

    console.log(
      `[Compose] Composition ready: ${composition.durationInFrames} frames, ${composition.width}x${composition.height}`
    );
    updateJobProgress(jobId, 30);

    // Create temp directory for output
    const tempDir = path.join(process.cwd(), "temp");
    await fs.mkdir(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `${jobId}.mp4`);

    // Render the video
    console.log("[Compose] Rendering video...");
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress }) => {
        // Map render progress (0-1) to job progress (30-80)
        const jobProgress = Math.round(30 + progress * 50);
        updateJobProgress(jobId, jobProgress);

        if (Math.round(progress * 100) % 20 === 0) {
          console.log(
            `[Compose] Render progress: ${Math.round(progress * 100)}%`
          );
        }
      },
    });

    console.log("[Compose] Render complete, uploading to Mux...");
    updateJobProgress(jobId, 80);

    // Upload to Mux
    const composedPlaybackId = await uploadToMux(outputPath, (progress) => {
      updateJobProgress(jobId, progress);
    });

    // Clean up temp file
    await fs.unlink(outputPath).catch(() => {
      // Ignore cleanup errors
    });

    console.log(`[Compose] Composition complete: ${composedPlaybackId}`);
    completeJob(jobId, {
      success: true,
      composedVideoPlaybackId: composedPlaybackId,
    });
  } catch (error) {
    console.error(`[Compose] Composition failed for job ${jobId}:`, error);
    completeJob(jobId, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
