import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;

export type ComposeVideoOptions = {
  videoUrl: string;
  imageFile: File;
  overlayText: string;
  onProgress?: (progress: number) => void;
};

/**
 * Initialize FFmpeg instance
 * This should be called once before using composeVideo
 */
export async function initializeFFmpeg(
  onProgress?: (progress: number) => void
): Promise<void> {
  if (ffmpegInstance) {
    return; // Already initialized
  }

  ffmpegInstance = new FFmpeg();

  // Set up progress logging
  if (onProgress) {
    ffmpegInstance.on("progress", ({ progress }) => {
      onProgress(progress * 100);
    });
  }

  ffmpegInstance.on("log", ({ message }) => {
    console.log("[FFmpeg]", message);
  });

  // Load FFmpeg with CDN URLs
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  console.log("[FFmpeg] Initialized successfully");
}

/**
 * Compose video with overlay image and text
 * Returns a Blob of the composed video
 */
export async function composeVideo(
  options: ComposeVideoOptions
): Promise<Blob> {
  if (!ffmpegInstance) {
    throw new Error("FFmpeg not initialized. Call initializeFFmpeg() first.");
  }

  const { videoUrl, imageFile, overlayText, onProgress } = options;

  try {
    console.log("[VideoComposer] Starting video composition...");
    onProgress?.(0);

    // Fetch and load video
    console.log("[VideoComposer] Fetching video from:", videoUrl);
    const videoData = await fetchFile(videoUrl);
    await ffmpegInstance.writeFile("input.mp4", videoData);
    onProgress?.(20);

    // Load overlay image
    console.log("[VideoComposer] Loading overlay image");
    const imageData = await fetchFile(imageFile);
    const imageExt = imageFile.name.split(".").pop() || "png";
    await ffmpegInstance.writeFile(`overlay.${imageExt}`, imageData);
    onProgress?.(30);

    // Escape text for ffmpeg filter
    const escapedText = overlayText
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/:/g, "\\:");

    // Create filter complex for image overlay and text
    // Position image and text in bottom-right corner with 20px margin
    const filterComplex = [
      // Scale and overlay image
      "[1:v]scale=120:120[overlay]",
      "[0:v][overlay]overlay=W-w-20:H-h-90[v1]",
      // Add text below image
      `[v1]drawtext=text='${escapedText}':x=W-tw-20:y=H-40:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=5[outv]`,
    ].join(";");

    console.log("[VideoComposer] Composing video...");

    // Run FFmpeg command
    await ffmpegInstance.exec([
      "-i",
      "input.mp4",
      "-i",
      `overlay.${imageExt}`,
      "-filter_complex",
      filterComplex,
      "-map",
      "[outv]",
      "-map",
      "0:a?", // Copy audio if it exists
      "-c:a",
      "copy",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "output.mp4",
    ]);

    onProgress?.(90);

    // Read output file
    console.log("[VideoComposer] Reading output file...");
    const data = await ffmpegInstance.readFile("output.mp4");
    const blob = new Blob([data], { type: "video/mp4" });

    // Cleanup
    await ffmpegInstance.deleteFile("input.mp4");
    await ffmpegInstance.deleteFile(`overlay.${imageExt}`);
    await ffmpegInstance.deleteFile("output.mp4");

    onProgress?.(100);
    console.log("[VideoComposer] Video composition complete!");

    return blob;
  } catch (error) {
    console.error("[VideoComposer] Error composing video:", error);
    throw new Error(
      `Failed to compose video: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get FFmpeg version info (useful for debugging)
 */
export async function getFFmpegVersion(): Promise<string> {
  if (!ffmpegInstance) {
    throw new Error("FFmpeg not initialized");
  }

  try {
    await ffmpegInstance.exec(["-version"]);
    return "FFmpeg loaded successfully";
  } catch {
    return "Version check failed";
  }
}

/**
 * Cleanup FFmpeg resources
 */
export function terminateFFmpeg(): void {
  if (ffmpegInstance) {
    ffmpegInstance.terminate();
    ffmpegInstance = null;
    console.log("[FFmpeg] Terminated");
  }
}
