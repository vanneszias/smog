/**
 * FFmpeg service with builder pattern for video composition
 * Provides a fluent API for constructing complex FFmpeg filter chains
 */

import type { OverlayConfig } from "@smog/types";
import type { FfmpegCommand } from "fluent-ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { createFFmpegError } from "../types/errors";
import {
  convertOverlayPosition,
  convertTextPosition,
  type VideoDimensions,
} from "../utils/coordinates";
import {
  calculateLineHeight,
  escapeFFmpegText,
  splitTextIntoLines,
} from "../utils/text";

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export interface OverlayImageConfig {
  position: { x: number; y: number };
  size: { width: number; height: number };
  startTime: number;
}

export interface OverlayTextConfig {
  text: string;
  centerX: number;
  y: number;
  fontSize: number;
  color: string;
  startTime: number;
  fontPath?: string;
}

export interface FFmpegProgress {
  percent: number;
  currentTime: number;
  targetSize: number;
}

/**
 * FFmpeg filter builder for creating complex filter chains
 */
export class FFmpegFilterBuilder {
  private readonly filters: string[] = [];

  /**
   * Add image overlay with positioning and timing
   */
  addImageOverlay(config: OverlayImageConfig): this {
    // Scale image to target size
    this.filters.push(
      `[1:v]scale=${config.size.width}:${config.size.height}:force_original_aspect_ratio=decrease[scaled]`
    );

    // Add white background pad
    this.filters.push(
      `[scaled]pad=${config.size.width}:${config.size.height}:(ow-iw)/2:(oh-ih)/2:color=white[padded]`
    );

    // Ensure RGBA format
    this.filters.push("[padded]format=rgba[overlay_ready]");

    // Overlay at position with timing
    this.filters.push(
      `[0:v][overlay_ready]overlay=${config.position.x}:${config.position.y}:enable='gte(t,${config.startTime})'[v1]`
    );

    return this;
  }

  /**
   * Add text overlay with multi-line support
   */
  addTextOverlay(config: OverlayTextConfig): this {
    const lines = splitTextIntoLines(config.text);
    const lineHeight = calculateLineHeight(config.fontSize);
    const fontPath = config.fontPath || "/app/assets/font.ttf";

    let currentLabel = "v1";
    for (const [index, line] of lines.entries()) {
      const isLastLine = index === lines.length - 1;
      const nextLabel = isLastLine ? "v" : `v${index + 2}`;
      const yPosition = config.y + index * lineHeight;

      // Securely escape text for FFmpeg drawtext filter
      // This prevents filter parsing errors and command injection attacks
      const escapedLine = escapeFFmpegText(line);

      this.filters.push(
        `[${currentLabel}]drawtext=text='${escapedLine}':fontfile=${fontPath}:fontsize=${config.fontSize}:fontcolor=0x${config.color}:x=${config.centerX}-text_w/2:y=${yPosition}:enable='gte(t,${config.startTime})'[${nextLabel}]`
      );

      currentLabel = nextLabel;
    }

    return this;
  }

  /**
   * Build the filter complex string
   */
  build(): string {
    return this.filters.join(";");
  }
}

/**
 * FFmpeg service for video composition
 */
export class FFmpegService {
  /**
   * Get video metadata using ffprobe
   */
  async getMetadata(videoPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(createFFmpegError("probe", err));
          return;
        }

        const duration = metadata.format.duration || 0;
        const videoStream = metadata.streams[0];
        const width = videoStream?.width || 1920;
        const height = videoStream?.height || 1080;

        resolve({ duration, width, height });
      });
    });
  }

  /**
   * Compose video with overlay and text using configuration
   */
  async composeVideo(
    videoPath: string,
    overlayImagePath: string,
    overlayText: string,
    outputPath: string,
    config: OverlayConfig,
    onProgress?: (progress: FFmpegProgress) => void
  ): Promise<void> {
    console.log("[FFmpegService] Starting video composition...");

    try {
      // Get video metadata
      const metadata = await this.getMetadata(videoPath);
      const videoDimensions: VideoDimensions = {
        width: metadata.width,
        height: metadata.height,
      };

      console.log(
        `[FFmpegService] Video: ${metadata.width}x${metadata.height}, ${metadata.duration}s`
      );

      // Verify overlay image
      await this.verifyOverlayImage(overlayImagePath);

      // Calculate pixel positions from config
      const sponsorStartTime = Math.max(
        0,
        metadata.duration - config.animation.startTime
      );

      const imageOverlay = convertOverlayPosition(
        config.image.x,
        config.image.y,
        config.image.width,
        config.image.height,
        videoDimensions
      );

      const textOverlay = convertTextPosition(
        config.text.x,
        config.text.y,
        config.text.fontSize,
        videoDimensions
      );

      console.log(
        `[FFmpegService] Sponsor overlay: ${sponsorStartTime}s - ${metadata.duration}s`
      );
      console.log(
        `[FFmpegService] Image: ${imageOverlay.position.x},${imageOverlay.position.y} (${imageOverlay.size.width}x${imageOverlay.size.height})`
      );
      console.log(
        `[FFmpegService] Text: ${textOverlay.centerX},${textOverlay.y} (${textOverlay.fontSize}px)`
      );

      // Build filter chain
      const filterBuilder = new FFmpegFilterBuilder();
      filterBuilder
        .addImageOverlay({
          position: imageOverlay.position,
          size: imageOverlay.size,
          startTime: sponsorStartTime,
        })
        .addTextOverlay({
          text: overlayText,
          centerX: textOverlay.centerX,
          y: textOverlay.y,
          fontSize: textOverlay.fontSize,
          color: config.text.color.replace("#", ""),
          startTime: sponsorStartTime,
        });

      const filterComplex = filterBuilder.build();
      console.log("[FFmpegService] Filter chain:", filterComplex);

      // Execute FFmpeg
      await this.executeFFmpeg(
        videoPath,
        overlayImagePath,
        outputPath,
        filterComplex,
        metadata.duration,
        onProgress
      );

      console.log("[FFmpegService] Composition completed");
    } catch (error) {
      throw createFFmpegError(
        "composition",
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Verify overlay image is readable by FFmpeg
   */
  private async verifyOverlayImage(imagePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(imagePath, (err, metadata) => {
        if (err) {
          reject(createFFmpegError("probe overlay image", err));
          return;
        }

        const imageStream = metadata.streams[0];
        console.log("[FFmpegService] Overlay image:", {
          format: metadata.format.format_name,
          width: imageStream?.width,
          height: imageStream?.height,
          pixelFormat: imageStream?.pix_fmt,
          codec: imageStream?.codec_name,
        });

        resolve();
      });
    });
  }

  /**
   * Execute FFmpeg command with progress tracking
   */
  private async executeFFmpeg(
    videoPath: string,
    overlayImagePath: string,
    outputPath: string,
    filterComplex: string,
    duration: number,
    onProgress?: (progress: FFmpegProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command: FfmpegCommand = ffmpeg()
        .input(videoPath)
        .input(overlayImagePath)
        .complexFilter(filterComplex)
        .map("[v]")
        .outputOptions([
          "-c:v libx264", // H.264 codec
          "-preset medium", // Balanced speed/quality
          "-crf 18", // High quality
          "-c:a copy", // Copy audio
          "-movflags +faststart", // Enable streaming
        ])
        .output(outputPath);

      // Progress tracking
      command.on("progress", (progress) => {
        if (duration > 0 && progress.timemark) {
          const timeParts = progress.timemark.split(":");
          const seconds =
            Number.parseInt(timeParts[0] || "0", 10) * 3600 +
            Number.parseInt(timeParts[1] || "0", 10) * 60 +
            Number.parseFloat(timeParts[2] || "0");

          const percent = Math.min((seconds / duration) * 100, 100);

          onProgress?.({
            percent,
            currentTime: seconds,
            targetSize: progress.targetSize || 0,
          });

          console.log(`[FFmpegService] Progress: ${percent.toFixed(1)}%`);
        }
      });

      command.on("end", () => resolve());

      command.on("error", (err, stdout, stderr) => {
        console.error("[FFmpegService] Error:", err);
        console.error("[FFmpegService] stderr:", stderr);
        console.error("[FFmpegService] stdout:", stdout);
        reject(createFFmpegError("execution", err));
      });

      // Log errors in stderr
      command.on("stderr", (stderrLine) => {
        if (
          stderrLine.includes("Error") ||
          stderrLine.includes("Invalid") ||
          stderrLine.includes("fail")
        ) {
          console.error("[FFmpegService] stderr:", stderrLine);
        }
      });

      command.run();
    });
  }
}
