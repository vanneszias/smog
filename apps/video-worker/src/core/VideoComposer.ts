/**
 * Video Composer - Main orchestrator for video processing pipeline
 * Provides a fluent API for composing videos with sponsor overlays
 */

import { DEFAULT_OVERLAY_CONFIG, type OverlayConfig } from "@smog/types";
import { FFmpegService } from "../services/ffmpeg";
import { ImageService } from "../services/image";
import { type MuxCredentials, MuxService } from "../services/mux";
import { VideoProcessingError } from "../types/errors";
import {
  calculateOverallProgress,
  VideoProcessingEmitter,
} from "../utils/events";
import {
  cleanupWorkspace,
  createWorkspace,
  type WorkspaceFiles,
} from "../utils/filesystem";

export interface VideoComposerOptions {
  playbackId: string;
  overlayImageUrl: string;
  overlayText: string;
  overlayConfig?: OverlayConfig;
}

export interface VideoComposerResult {
  success: boolean;
  composedVideoPlaybackId?: string;
  error?: string;
}

/**
 * Video Composer with fluent API
 * Orchestrates the entire video processing pipeline
 */
export class VideoComposer {
  private readonly muxService: MuxService;
  private readonly imageService: ImageService;
  private readonly ffmpegService: FFmpegService;
  private readonly events: VideoProcessingEmitter;
  private workspace?: WorkspaceFiles;

  constructor(muxCredentials: MuxCredentials) {
    this.muxService = new MuxService(muxCredentials);
    this.imageService = new ImageService();
    this.ffmpegService = new FFmpegService();
    this.events = new VideoProcessingEmitter();
  }

  /**
   * Get the event emitter for progress tracking
   */
  getEmitter(): VideoProcessingEmitter {
    return this.events;
  }

  /**
   * Register a progress callback (legacy support)
   * Converts to event-based tracking internally
   */
  onProgress(callback: (percent: number) => void): this {
    this.events.on("download:progress", (percent) =>
      callback(calculateOverallProgress("download:progress", percent))
    );
    this.events.on("image:progress", (percent) =>
      callback(calculateOverallProgress("image:progress", percent))
    );
    this.events.on("compose:progress", (percent) =>
      callback(calculateOverallProgress("compose:progress", percent))
    );
    this.events.on("upload:progress", (percent) =>
      callback(calculateOverallProgress("upload:progress", percent))
    );
    return this;
  }

  /**
   * Execute the video composition
   */
  async compose(options: VideoComposerOptions): Promise<VideoComposerResult> {
    try {
      // Create workspace
      this.workspace = await createWorkspace();
      const config = options.overlayConfig || DEFAULT_OVERLAY_CONFIG;

      console.log("[VideoComposer] Starting video composition");
      console.log("[VideoComposer] Playback ID:", options.playbackId);
      console.log("[VideoComposer] Workspace:", this.workspace.workDir);

      // Step 1: Download video
      this.events.emit("download:start");
      await this.muxService.downloadVideo({
        playbackId: options.playbackId,
        destination: this.workspace.videoPath,
      });
      this.events.emit("download:complete");

      // Step 2: Process image
      this.events.emit("image:start");
      await this.imageService.processImage({
        imageUrl: options.overlayImageUrl,
        destination: this.workspace.overlayPath,
      });
      this.events.emit("image:complete");

      // Step 3: Compose video
      this.events.emit("compose:start");
      await this.ffmpegService.composeVideo(
        this.workspace.videoPath,
        this.workspace.overlayPath,
        options.overlayText,
        this.workspace.outputPath,
        config,
        (progress) => {
          this.events.emit("compose:progress", progress.percent);
        }
      );
      this.events.emit("compose:complete");

      // Step 4: Upload to Mux
      this.events.emit("upload:start");
      const playbackId = await this.muxService.uploadVideo({
        videoPath: this.workspace.outputPath,
        isDevelopment: process.env.NODE_ENV === "development",
      });
      this.events.emit("upload:complete", playbackId);

      console.log(
        `[VideoComposer] Composition completed! Playback ID: ${playbackId}`
      );

      this.events.emit("complete", playbackId);

      return {
        success: true,
        composedVideoPlaybackId: playbackId,
      };
    } catch (error) {
      console.error("[VideoComposer] Error:", error);
      this.events.emit("error", error as Error);

      return {
        success: false,
        error:
          error instanceof VideoProcessingError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unknown error",
      };
    } finally {
      // Cleanup workspace
      if (this.workspace) {
        this.events.emit("cleanup:start");
        await cleanupWorkspace(this.workspace.workDir);
        this.events.emit("cleanup:complete");
      }
    }
  }
}

/**
 * Factory function for creating a VideoComposer instance
 * Provides a clean entry point to the API
 */
export const createVideoComposer = (
  muxCredentials: MuxCredentials
): VideoComposer => new VideoComposer(muxCredentials);
