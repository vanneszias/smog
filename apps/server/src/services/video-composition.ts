import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Mux from "@mux/mux-node";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export type ComposeVideoOptions = {
  playbackId: string;
  overlayImageBuffer: Buffer;
  overlayText: string;
};

export type ComposeVideoResult = {
  outputPath: string;
  cleanup: () => Promise<void>;
};

/**
 * Find Mux asset by playback ID with pagination
 */
async function findAssetByPlaybackId(
  playbackId: string
): Promise<{ id: string; master?: { url?: string } } | undefined> {
  let asset: { id: string; master?: { url?: string } } | undefined;
  let page = 1;
  const limit = 100;

  while (!asset) {
    const assetsResponse = await mux.video.assets.list({ limit, page });
    const assets = assetsResponse.data;

    if (!assets || assets.length === 0) {
      break;
    }

    asset = assets.find((a: { playback_ids?: Array<{ id?: string }> }) =>
      a.playback_ids?.some((p) => p.id === playbackId)
    ) as { id: string; master?: { url?: string } } | undefined;

    if (asset || assets.length < limit) {
      break;
    }
    page++;
  }

  return asset;
}

/**
 * Get download URL for Mux video (server-side only, never expose to client!)
 */
async function getMuxVideoUrl(playbackId: string): Promise<string> {
  console.log(
    `[VideoComposition] Finding asset for playback ID: ${playbackId}`
  );

  const asset = await findAssetByPlaybackId(playbackId);

  if (!asset) {
    throw new Error(`Asset not found for playback ID: ${playbackId}`);
  }

  // Enable master access if not already enabled
  console.log(
    `[VideoComposition] Enabling master access for asset ${asset.id}`
  );
  await mux.video.assets.updateMasterAccess(asset.id, {
    master_access: "temporary",
  });

  // Refresh asset to get master URL
  const updatedAsset = await mux.video.assets.retrieve(asset.id);

  if (updatedAsset.master?.url) {
    console.log(`[VideoComposition] Got master URL for asset ${asset.id}`);
    return updatedAsset.master.url;
  }

  throw new Error(`Failed to get master URL for asset ${asset.id}`);
}

/**
 * Download file from URL to local temp file
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`[VideoComposition] Downloading file from URL to ${destPath}`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(destPath, Buffer.from(buffer));
  console.log("[VideoComposition] File downloaded successfully");
}

/**
 * Convert SVG buffer to PNG buffer
 */
async function convertSvgToPng(
  svgBuffer: Buffer,
  width = 512,
  height = 512
): Promise<Buffer> {
  console.log("[VideoComposition] Converting SVG to PNG");
  return sharp(svgBuffer)
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/**
 * Detect if buffer is SVG by checking file signature
 */
function isSvgBuffer(buffer: Buffer): boolean {
  const header = buffer.slice(0, 100).toString("utf8").toLowerCase();
  return header.includes("<svg") || header.includes("<?xml");
}

/**
 * Compose video with overlay image and text using FFmpeg
 */
export async function composeVideo(
  options: ComposeVideoOptions
): Promise<ComposeVideoResult> {
  const { playbackId, overlayImageBuffer, overlayText } = options;
  const jobId = uuidv4();
  const tempDir = path.join(os.tmpdir(), `video-composition-${jobId}`);

  console.log(`[VideoComposition] Starting job ${jobId}`);

  // Create temp directory
  await fs.mkdir(tempDir, { recursive: true });

  const videoPath = path.join(tempDir, "input.mp4");
  const imagePath = path.join(tempDir, "overlay.png");
  const fontPath = path.join(process.cwd(), "fonts", "Roboto-Regular.ttf");
  const outputPath = path.join(tempDir, "output.mp4");

  const cleanup = async () => {
    console.log(`[VideoComposition] Cleaning up temp directory ${tempDir}`);
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("[VideoComposition] Cleanup error:", error);
    }
  };

  try {
    // 1. Get video URL from Mux (server-side only!)
    const videoUrl = await getMuxVideoUrl(playbackId);

    // 2. Download video to temp file
    await downloadFile(videoUrl, videoPath);

    // 3. Convert SVG to PNG if needed
    let imageBuffer = overlayImageBuffer;
    if (isSvgBuffer(overlayImageBuffer)) {
      console.log("[VideoComposition] Detected SVG, converting to PNG");
      imageBuffer = await convertSvgToPng(overlayImageBuffer);
    }
    await fs.writeFile(imagePath, imageBuffer);

    // 4. Escape text for FFmpeg drawtext filter
    const escapedText = overlayText
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/:/g, "\\:");

    // 5. Build FFmpeg filter complex
    const filterComplex = [
      "[1:v]scale=120:120[overlay]",
      "[0:v][overlay]overlay=W-w-20:H-h-90[v1]",
      `[v1]drawtext=text='${escapedText}':fontfile='${fontPath}':x=W-tw-20:y=H-40:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=5[outv]`,
    ].join(";");

    // 6. Run FFmpeg composition
    console.log("[VideoComposition] Running FFmpeg composition");
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(imagePath)
        .complexFilter(filterComplex)
        .outputOptions([
          "-map",
          "[outv]",
          "-map",
          "0:a?",
          "-c:a",
          "copy",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
        ])
        .output(outputPath)
        .on("start", (commandLine) => {
          console.log(`[VideoComposition] FFmpeg command: ${commandLine}`);
        })
        .on("progress", (progress) => {
          console.log(
            `[VideoComposition] Processing: ${progress.percent?.toFixed(1)}% done`
          );
        })
        .on("end", () => {
          console.log("[VideoComposition] FFmpeg processing complete");
          resolve();
        })
        .on("error", (err) => {
          console.error("[VideoComposition] FFmpeg error:", err);
          reject(new Error(`FFmpeg processing failed: ${err.message}`));
        })
        .on("progress", (progress) => {
          console.log(
            `[VideoComposition] Processing: ${progress.percent?.toFixed(1)}% done`
          );
        })
        .on("end", () => {
          console.log("[VideoComposition] FFmpeg processing complete");
          resolve();
        })
        .on("error", (err) => {
          console.error("[VideoComposition] FFmpeg error:", err);
          reject(new Error(`FFmpeg processing failed: ${err.message}`));
        })
        .run();
    });

    console.log(`[VideoComposition] Job ${jobId} completed successfully`);
    return { outputPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
