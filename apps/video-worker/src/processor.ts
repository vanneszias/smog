import * as fs from "node:fs/promises";
import * as path from "node:path";
import Mux from "@mux/mux-node";
import type { OverlayConfig } from "@smog/types";
import { DEFAULT_OVERLAY_CONFIG } from "@smog/types";
import type { FfmpegCommand } from "fluent-ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

// Initialize Mux client
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export type VideoCompositionJob = {
  playbackId: string;
  overlayImageUrl: string;
  overlayText: string;
  overlayConfig?: OverlayConfig;
};

export type VideoCompositionResult = {
  success: boolean;
  composedVideoPlaybackId?: string;
  error?: string;
};

export type ProgressCallback = (progress: number) => void;

/**
 * Process video composition with FFmpeg
 *
 * Steps:
 * 1. Download original video from Mux
 * 2. Download and process overlay image with Sharp
 * 3. Compose video with FFmpeg (overlay + text)
 * 4. Upload composed video to Mux
 * 5. Clean up temporary files
 *
 * @param job - Video composition job data
 * @param onProgress - Optional progress callback
 * @returns Result with composed video Mux playback ID
 */
export async function processVideoComposition(
  job: VideoCompositionJob,
  onProgress?: ProgressCallback
): Promise<VideoCompositionResult> {
  const workDir = path.join("/tmp/video-processing", uuidv4());
  const videoPath = path.join(workDir, "original.mp4");
  const overlayPath = path.join(workDir, "overlay.png");
  const outputPath = path.join(workDir, "composed.mp4");

  // Use provided config or default
  const config = job.overlayConfig || DEFAULT_OVERLAY_CONFIG;

  try {
    // Create working directory
    await fs.mkdir(workDir, { recursive: true });

    console.log(`[Processor] Starting video composition in ${workDir}`);
    console.log(`[Processor] Playback ID: ${job.playbackId}`);
    console.log(`[Processor] Overlay text: ${job.overlayText}`);
    console.log("[Processor] Overlay config:", config);

    // Step 1: Download video from Mux (0-30%)
    onProgress?.(5);
    console.log("[Processor] Downloading video from Mux...");
    await downloadVideoFromMux(job.playbackId, videoPath);
    onProgress?.(30);

    // Step 2: Process overlay image (30-40%)
    console.log("[Processor] Processing overlay image...");
    await processOverlayImage(job.overlayImageUrl, overlayPath);
    onProgress?.(40);

    // Step 3: Compose video with FFmpeg (40-80%)
    console.log("[Processor] Composing video with FFmpeg...");
    await composeVideoWithFFmpeg(
      videoPath,
      overlayPath,
      job.overlayText,
      outputPath,
      config,
      (ffmpegProgress) => {
        // Map FFmpeg progress (0-100) to our range (40-80)
        const mappedProgress = 40 + (ffmpegProgress * 40) / 100;
        onProgress?.(Math.round(mappedProgress));
      }
    );
    onProgress?.(80);

    // Step 4: Upload to Mux (80-100%)
    console.log("[Processor] Uploading composed video to Mux...");
    const composedVideoPlaybackId = await uploadComposedVideoToMux(outputPath);
    onProgress?.(100);

    console.log(
      `[Processor] Video composition completed! New playback ID: ${composedVideoPlaybackId}`
    );

    return {
      success: true,
      composedVideoPlaybackId,
    };
  } catch (error) {
    console.error("[Processor] Error processing video:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    // Clean up temporary files
    try {
      await fs.rm(workDir, { recursive: true, force: true });
      console.log(`[Processor] Cleaned up ${workDir}`);
    } catch (cleanupError) {
      console.error("[Processor] Failed to cleanup:", cleanupError);
    }
  }
}

/**
 * Download video from Mux using secure master access
 * Requests a temporary download URL from the server API which uses Mux credentials
 * This ensures only authorized services can download videos
 */
async function downloadVideoFromMux(
  playbackId: string,
  destination: string
): Promise<void> {
  console.log(
    `[Processor] Requesting secure download URL for playback ID: ${playbackId}`
  );

  // Step 1: Get temporary master download URL from server API
  const serverUrl = process.env.SERVER_URL || "http://server:3000";
  const apiKey = process.env.VIDEO_WORKER_API_KEY || "dev-secret-key";

  const masterAccessResponse = await fetch(
    `${serverUrl}/api/video/master-access`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ playbackId }),
    }
  );

  if (!masterAccessResponse.ok) {
    const errorText = await masterAccessResponse.text();
    throw new Error(
      `Failed to get master access URL: ${masterAccessResponse.status} ${masterAccessResponse.statusText} - ${errorText}`
    );
  }

  const { url: videoUrl, expiresAt } = (await masterAccessResponse.json()) as {
    url: string;
    expiresAt: string;
  };

  console.log(`[Processor] Got temporary master URL (expires: ${expiresAt})`);
  console.log("[Processor] Downloading from secure URL...");

  // Step 2: Download video from temporary URL
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download video from Mux: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(destination, Buffer.from(arrayBuffer));

  const stats = await fs.stat(destination);
  console.log(
    `[Processor] Downloaded video: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
  );
}

/**
 * Process overlay image with Sharp
 * Converts any format to PNG with transparency support
 * Fixed maximum size: 300x300px for consistency across all sponsors
 */
async function processOverlayImage(
  imageUrl: string,
  destination: string
): Promise<void> {
  console.log(`[Processor] Processing overlay image from ${imageUrl}`);

  // Download image
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download overlay image: ${response.status} ${response.statusText}`
    );
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());

  // Process with Sharp: convert to PNG with transparency
  // Fixed maximum size: 200x200px for consistency across all sponsors
  await sharp(imageBuffer)
    .resize(200, 200, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toFile(destination);

  const stats = await fs.stat(destination);
  console.log(
    `[Processor] Processed overlay image (max 200x200px): ${(stats.size / 1024).toFixed(2)} KB`
  );
}

/**
 * Compose video with FFmpeg
 * Adds overlay image and text with custom positioning based on config
 * Uses custom font for consistent branding
 * Maintains original video quality
 */
async function composeVideoWithFFmpeg(
  videoPath: string,
  overlayImagePath: string,
  overlayText: string,
  outputPath: string,
  config: OverlayConfig,
  onProgress?: (progress: number) => void
): Promise<void> {
  // Create temp text file for multiline text support
  const textFilePath = path.join(path.dirname(outputPath), "overlay-text.txt");
  const wrappedText = wrapText(overlayText, 30);
  await fs.writeFile(textFilePath, wrappedText, "utf-8");

  return new Promise((resolve, reject) => {
    console.log("[Processor] Starting FFmpeg composition...");

    // Get video duration and dimensions first for calculations
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(new Error(`FFprobe error: ${err.message}`));
        return;
      }

      const duration = metadata.format.duration || 0;
      const videoWidth = metadata.streams[0].width || 1920;
      const videoHeight = metadata.streams[0].height || 1080;

      // Convert percentage-based config to pixel values
      const imageConfig = {
        x: Math.round((config.image.x / 100) * videoWidth),
        y: Math.round((config.image.y / 100) * videoHeight),
        width: Math.round((config.image.width / 100) * videoWidth),
        height: Math.round((config.image.height / 100) * videoHeight),
      };

      const textConfig = {
        x: Math.round((config.text.x / 100) * videoWidth),
        y: Math.round((config.text.y / 100) * videoHeight),
        fontSize: Math.round((config.text.fontSize / 100) * videoHeight),
        color: config.text.color.replace("#", ""),
      };

      const sponsorStartTime = Math.max(
        0,
        duration - config.animation.startTime
      );
      const fadeInDuration = config.animation.fadeInDuration;

      console.log(`[Processor] Video dimensions: ${videoWidth}x${videoHeight}`);
      console.log(`[Processor] Video duration: ${duration}s`);
      console.log(
        `[Processor] Sponsor overlay will appear from ${sponsorStartTime}s to ${duration}s`
      );
      console.log("[Processor] Image overlay config (pixels):", imageConfig);
      console.log("[Processor] Text overlay config (pixels):", textConfig);

      // Build FFmpeg command
      const command: FfmpegCommand = ffmpeg()
        .input(videoPath)
        .input(overlayImagePath);

      // Complex filter for overlay positioning and text with fade-in animation
      // Scale image to exact size, manipulate alpha for fade-in, then overlay at custom position
      // Text is positioned at custom location with custom size/color and fade-in
      const fadeEndTime = sponsorStartTime + fadeInDuration;

      const filterComplex = [
        // Scale image to exact size and ensure RGBA format for alpha manipulation
        `[1:v]scale=${imageConfig.width}:${imageConfig.height},format=rgba[scaled]`,

        // Apply fade-in animation to the overlay image using geq filter to manipulate alpha channel
        // Alpha value: 0 before start, linear fade from 0 to 255 during fade-in, 255 after
        `[scaled]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(T,${sponsorStartTime}),0,if(lt(T,${fadeEndTime}),(T-${sponsorStartTime})/${fadeInDuration}*alpha(X,Y),alpha(X,Y)))'[overlay]`,

        // Overlay image at custom position, enabled only during sponsor time
        `[0:v][overlay]overlay=${imageConfig.x}:${imageConfig.y}:enable='gte(t,${sponsorStartTime})'[v1]`,

        // Add wrapped text at custom position with custom size/color and fade-in using alpha expression
        // Alpha value: 0 before start, linear fade from 0 to 1 during fade-in, 1 after
        `[v1]drawtext=textfile='${textFilePath}':fontfile=/app/assets/font.ttf:fontsize=${textConfig.fontSize}:fontcolor=0x${textConfig.color}:x=${textConfig.x}:y=${textConfig.y}:alpha='if(lt(t,${sponsorStartTime}),0,if(lt(t,${fadeEndTime}),(t-${sponsorStartTime})/${fadeInDuration},1))'[v]`,
      ].join(";");

      command
        .complexFilter(filterComplex)
        .map("[v]")
        .outputOptions([
          "-c:v libx264", // H.264 codec
          "-preset medium", // Balanced speed/quality
          "-crf 18", // High quality (lower = better, 18 is visually lossless)
          "-c:a copy", // Copy audio stream without re-encoding
          "-movflags +faststart", // Enable streaming
        ])
        .output(outputPath);

      // Progress tracking
      command.on("progress", (progress) => {
        if (duration > 0 && progress.timemark) {
          // Parse timemark (format: "HH:MM:SS.mm")
          const timeParts = progress.timemark.split(":");
          const seconds =
            Number.parseInt(timeParts[0], 10) * 3600 +
            Number.parseInt(timeParts[1], 10) * 60 +
            Number.parseFloat(timeParts[2]);

          const percent = Math.min((seconds / duration) * 100, 100);
          onProgress?.(Math.round(percent));
          console.log(`[Processor] FFmpeg progress: ${percent.toFixed(1)}%`);
        }
      });

      command.on("end", async () => {
        console.log("[Processor] FFmpeg composition completed");
        // Clean up temp text file
        try {
          await fs.unlink(textFilePath);
        } catch (cleanupError) {
          console.error(
            "[Processor] Failed to cleanup text file:",
            cleanupError
          );
        }
        resolve();
      });

      command.on("error", async (ffmpegError) => {
        console.error("[Processor] FFmpeg error:", ffmpegError);
        // Clean up temp text file
        try {
          await fs.unlink(textFilePath);
        } catch (cleanupError) {
          console.error(
            "[Processor] Failed to cleanup text file:",
            cleanupError
          );
        }
        reject(new Error(`FFmpeg error: ${ffmpegError.message}`));
      });

      command.run();
    });
  });
}

/**
 * Wrap text to fit within a maximum character width
 * Inserts \n at word boundaries to create multi-line text
 */
function wrapText(text: string, maxCharsPerLine = 30): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

/**
 * Upload composed video to Mux using direct upload
 */
async function uploadComposedVideoToMux(videoPath: string): Promise<string> {
  console.log("[Processor] Uploading to Mux via direct upload...");

  try {
    // Step 1: Create a direct upload with master access enabled for secure downloads
    const upload = await mux.video.uploads.create({
      new_asset_settings: {
        playback_policy: ["public"],
        master_access: "temporary",
        test: process.env.NODE_ENV === "development",
      },
      cors_origin: "*",
    });

    console.log("[Processor] Direct upload created:", upload.id);
    console.log("[Processor] Upload URL:", upload.url);

    // Step 2: Read the video file
    const videoBuffer = await fs.readFile(videoPath);
    const stats = await fs.stat(videoPath);
    console.log(
      `[Processor] Video file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
    );

    // Step 3: Upload the video file to Mux's upload URL
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
      throw new Error(
        `Failed to upload video file: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`
      );
    }

    console.log("[Processor] Video file uploaded successfully");

    // Step 4: Wait for the asset to be created
    let assetId: string | undefined;
    const maxAttempts = 150; // 5 minutes
    let attempts = 0;

    while (!assetId && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const uploadStatus = await mux.video.uploads.retrieve(upload.id);
      assetId = uploadStatus.asset_id;
      attempts++;

      console.log(
        `[Processor] Waiting for asset creation (attempt ${attempts}/${maxAttempts})...`
      );
    }

    if (!assetId) {
      throw new Error("Failed to get asset ID from upload after 5 minutes");
    }

    console.log("[Processor] Mux asset created:", assetId);

    // Step 5: Wait for asset to be ready
    let assetStatus = await mux.video.assets.retrieve(assetId);
    attempts = 0;

    while (assetStatus.status !== "ready" && attempts < maxAttempts) {
      if (assetStatus.status === "errored") {
        throw new Error(
          `Mux asset processing failed: ${JSON.stringify(assetStatus.errors)}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      assetStatus = await mux.video.assets.retrieve(assetId);
      attempts++;

      console.log(
        `[Processor] Asset status: ${assetStatus.status} (attempt ${attempts}/${maxAttempts})`
      );
    }

    if (assetStatus.status !== "ready") {
      throw new Error(
        `Mux asset processing timeout after ${maxAttempts * 2} seconds`
      );
    }

    const playbackId = assetStatus.playback_ids?.[0]?.id;
    if (!playbackId) {
      throw new Error("Mux asset has no playback ID");
    }

    console.log(
      "[Processor] Composed video ready with playback ID:",
      playbackId
    );
    return playbackId;
  } catch (error) {
    console.error("[Processor] Mux upload error:", error);
    throw error;
  }
}
