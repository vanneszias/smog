/**
 * Video Composition Service
 * Single responsibility: Orchestrate video composition flow
 */

import type { OverlayConfig } from "@smog/types";
import type { client } from "@/utils/orpc";
import { CompositionEventEmitter } from "./EventEmitter";
import { ImageConverter } from "./ImageConverter";
import { ProgressTracker } from "./ProgressTracker";
import { StatusPoller } from "./StatusPoller";
import { STEP_MESSAGES } from "./types";

export type ComposeOptions = {
  imageFile: File;
  overlayText: string;
  playbackId: string;
  overlayConfig: OverlayConfig;
};

export type ComposeResult = {
  success: boolean;
  playbackId?: string;
  error?: string;
};

export class VideoCompositionService {
  private readonly orpcClient: typeof client;
  private readonly eventEmitter = new CompositionEventEmitter();
  private readonly imageConverter = new ImageConverter();
  private readonly progressTracker = new ProgressTracker();
  private readonly statusPoller = new StatusPoller();
  private startTime = 0;

  constructor(orpcClient: typeof client) {
    this.orpcClient = orpcClient;
  }

  /**
   * Get event emitter for subscribing to events
   */
  getEmitter(): CompositionEventEmitter {
    return this.eventEmitter;
  }

  /**
   * Start video composition
   */
  async compose(options: ComposeOptions): Promise<ComposeResult> {
    this.startTime = Date.now();
    this.progressTracker.reset();

    try {
      // Step 1: Validate and convert image
      this.emitProgress(0, "preparing");

      const validation = this.imageConverter.validate(options.imageFile);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const base64Image = await this.imageConverter.toBase64(options.imageFile);
      this.emitProgress(5, "preparing");

      // Step 2: Start composition job
      this.emitProgress(10, "uploading");

      const response = await this.orpcClient.sponsorships.composeVideo({
        playbackId: options.playbackId,
        overlayImageUrl: base64Image,
        overlayText: options.overlayText,
        overlayConfig: options.overlayConfig,
      });

      const isSuccessful = response.success && Boolean(response.jobId);
      if (!isSuccessful) {
        throw new Error("Failed to start video composition");
      }

      this.emitProgress(15, "queued");

      // Step 3: Poll for completion
      const status = await this.statusPoller.poll(
        response.jobId,
        this.orpcClient,
        (jobStatus) => {
          this.handleStatusUpdate(jobStatus);
        }
      );

      // Step 4: Handle completion
      if (status.state === "completed" && status.result?.success) {
        const playbackId = status.result.composedVideoPlaybackId;
        if (!playbackId) {
          throw new Error("No playback ID returned");
        }

        this.emitComplete(playbackId);

        return {
          success: true,
          playbackId,
        };
      }

      throw new Error(status.result?.error || "Composition failed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";

      this.emitError(message);

      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Cancel ongoing composition
   */
  cancel(): void {
    this.statusPoller.stop();
  }

  /**
   * Handle status update from poller
   */
  private handleStatusUpdate(status: { progress: number }): void {
    const { step, hasStepChanged } = this.progressTracker.update(
      status.progress
    );

    if (hasStepChanged) {
      this.emitStepChange(step);
    }

    this.emitProgress(status.progress, step);
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    progress: number,
    step = this.progressTracker.getCurrentStep()
  ): void {
    const message = STEP_MESSAGES[step] || "Processing...";

    this.eventEmitter.emit({
      type: "progress",
      step,
      progress,
      message,
    });
  }

  /**
   * Emit step change event
   */
  private emitStepChange(
    currentStep: ReturnType<typeof this.progressTracker.getCurrentStep>
  ): void {
    this.eventEmitter.emit({
      type: "step-change",
      previousStep: this.progressTracker.getCurrentStep(),
      currentStep,
      progress: this.progressTracker.getCurrentProgress(),
    });
  }

  /**
   * Emit error event
   */
  private emitError(message: string): void {
    this.eventEmitter.emit({
      type: "error",
      step: this.progressTracker.getCurrentStep(),
      message,
      suggestion: "Please try again or contact support",
    });
  }

  /**
   * Emit complete event
   */
  private emitComplete(playbackId: string): void {
    const duration = Date.now() - this.startTime;

    this.eventEmitter.emit({
      type: "complete",
      playbackId,
      duration,
    });
  }
}
