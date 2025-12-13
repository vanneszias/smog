import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { processVideoComposition, type VideoCompositionJob } from "./processor";

// Redis connection
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const ONE_HOUR_SECONDS = 3600;
const ONE_DAY_SECONDS = 86_400;

// Video composition queue
export const videoQueue = new Queue("video-composition", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      age: ONE_HOUR_SECONDS, // Keep completed jobs for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: ONE_DAY_SECONDS, // Keep failed jobs for 24 hours
    },
  },
});

// Job processor
const processVideoCompositionJob = async (job: Job) => {
  console.log(`[Video Worker] Processing job ${job.id}`, job.data);

  const jobData: VideoCompositionJob = job.data;

  // Process the video with progress updates
  const result = await processVideoComposition(jobData, (progress) => {
    job.updateProgress(progress);
  });

  if (!result.success) {
    throw new Error(result.error || "Video composition failed");
  }

  console.log(
    `[Video Worker] Job ${job.id} completed successfully. New playback ID: ${result.composedVideoPlaybackId}`
  );

  return {
    success: true,
    composedVideoPlaybackId: result.composedVideoPlaybackId,
  };
};

// Worker instance
let worker: Worker | null = null;

export const initQueue = () => {
  const concurrency = Number(process.env.VIDEO_COMPOSITION_CONCURRENCY) || 2;

  worker = new Worker("video-composition", processVideoCompositionJob, {
    connection: redisConnection,
    concurrency,
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60_000, // Per minute
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
