import type { OverlayConfig } from "@smog/types";
import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { createVideoComposer } from "./core/VideoComposer";

// Redis connection
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const ONE_HOUR_SECONDS = 3600;
const ONE_DAY_SECONDS = 86_400;

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

// Video composition queue
export const videoQueue = new Queue<VideoCompositionJob>("video-composition", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      age: ONE_HOUR_SECONDS,
      count: 100,
    },
    removeOnFail: {
      age: ONE_DAY_SECONDS,
    },
  },
});

// Job processor using new VideoComposer architecture
const processVideoCompositionJob = async (
  job: Job<VideoCompositionJob>
): Promise<VideoCompositionResult> => {
  console.log(`[Video Worker] Processing job ${job.id}`, job.data);

  const { playbackId, overlayImageUrl, overlayText, overlayConfig } = job.data;

  // Create VideoComposer instance
  const composer = createVideoComposer({
    tokenId: process.env.MUX_TOKEN_ID!,
    tokenSecret: process.env.MUX_TOKEN_SECRET!,
  });

  // Register progress tracking using events
  const emitter = composer.getEmitter();

  // Map events to job progress updates
  emitter.on("download:start", () => {
    job.updateProgress(5);
    job.log("Starting video download...");
  });

  emitter.on("download:complete", () => {
    job.updateProgress(30);
    job.log("Video downloaded successfully");
  });

  emitter.on("image:start", () => {
    job.updateProgress(35);
    job.log("Processing overlay image...");
  });

  emitter.on("image:complete", () => {
    job.updateProgress(40);
    job.log("Image processed successfully");
  });

  emitter.on("compose:start", () => {
    job.updateProgress(45);
    job.log("Starting video composition with FFmpeg...");
  });

  emitter.on("compose:progress", (percent) => {
    // Map compose progress (0-100) to job progress (45-80)
    const mappedProgress = 45 + (percent * 35) / 100;
    job.updateProgress(Math.round(mappedProgress));
  });

  emitter.on("compose:complete", () => {
    job.updateProgress(80);
    job.log("Video composition completed");
  });

  emitter.on("upload:start", () => {
    job.updateProgress(85);
    job.log("Uploading composed video to Mux...");
  });

  emitter.on("upload:complete", (newPlaybackId) => {
    job.updateProgress(95);
    job.log(`Upload completed: ${newPlaybackId}`);
  });

  emitter.on("cleanup:complete", () => {
    job.updateProgress(100);
    job.log("Cleanup completed");
  });

  emitter.on("error", (error) => {
    job.log(`Error: ${error.message}`);
  });

  // Execute composition
  const result = await composer.compose({
    playbackId,
    overlayImageUrl,
    overlayText,
    overlayConfig,
  });

  if (!result.success) {
    throw new Error(result.error || "Video composition failed");
  }

  console.log(
    `[Video Worker] Job ${job.id} completed successfully. New playback ID: ${result.composedVideoPlaybackId}`
  );

  return result;
};

// Worker instance
let worker: Worker | null = null;

export const initQueue = () => {
  const concurrency = Number(process.env.VIDEO_COMPOSITION_CONCURRENCY) || 2;

  worker = new Worker("video-composition", processVideoCompositionJob, {
    connection: redisConnection,
    concurrency,
    limiter: {
      max: 10,
      duration: 60_000,
    },
  });

  worker.on("completed", (job) => {
    console.log(`[Video Worker] Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Video Worker] Job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    console.error("[Video Worker] Worker error:", err);
  });

  console.log(`[Video Worker] Worker started with concurrency: ${concurrency}`);
};

export const closeQueue = async () => {
  await worker?.close();
  await videoQueue.close();
  await redisConnection.quit();
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Video Worker] SIGTERM received, closing gracefully...");
  await closeQueue();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Video Worker] SIGINT received, closing gracefully...");
  await closeQueue();
  process.exit(0);
});
