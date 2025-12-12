import fs from "node:fs/promises";
import { type Job, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { composeVideo } from "./video-composition";

export type VideoCompositionJob = {
  playbackId: string;
  overlayImageStorageId: string;
  overlayText: string;
  uploadUrl: string; // Signed Convex upload URL
};

export type VideoCompositionResult = {
  success: boolean;
  storageId?: string;
  error?: string;
};

// Create Redis connection for BullMQ
const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null, // Required for BullMQ
});

// Create job queue
export const videoCompositionQueue = new Queue<VideoCompositionJob>(
  "video-composition",
  {
    connection,
    defaultJobOptions: {
      attempts: 2, // Retry once on failure
      backoff: {
        type: "exponential",
        delay: 5000, // 5 seconds
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 86_400, // Keep failed jobs for 24 hours
      },
    },
  }
);

// Worker to process video composition jobs
const worker = new Worker<VideoCompositionJob, VideoCompositionResult>(
  "video-composition",
  async (job: Job<VideoCompositionJob>) => {
    const { playbackId, overlayImageStorageId, overlayText, uploadUrl } =
      job.data;

    console.log(`[VideoCompositionQueue] Processing job ${job.id}`);
    console.log(`[VideoCompositionQueue] Playback ID: ${playbackId}`);

    try {
      // Update progress
      await job.updateProgress(10);

      // 1. Download overlay image from Convex storage
      const imageUrl = `${process.env.CONVEX_URL}/api/storage/${overlayImageStorageId}`;
      const imageResponse = await fetch(imageUrl);

      if (!imageResponse.ok) {
        throw new Error(
          `Failed to fetch overlay image: ${imageResponse.statusText}`
        );
      }

      const overlayImageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      await job.updateProgress(20);

      // 2. Compose video using FFmpeg
      console.log("[VideoCompositionQueue] Starting video composition");
      const { outputPath, cleanup } = await composeVideo({
        playbackId,
        overlayImageBuffer,
        overlayText,
      });

      await job.updateProgress(80);

      // 3. Upload composed video to Convex using signed URL
      console.log("[VideoCompositionQueue] Uploading to Convex storage");
      const videoBuffer = await fs.readFile(outputPath);

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "video/mp4",
        },
        body: videoBuffer,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload video: ${uploadResponse.statusText}`);
      }

      const uploadResult = (await uploadResponse.json()) as {
        storageId: string;
      };
      await job.updateProgress(95);

      // 4. Cleanup temp files
      await cleanup();
      await job.updateProgress(100);

      console.log(
        `[VideoCompositionQueue] Job ${job.id} completed successfully`
      );
      return {
        success: true,
        storageId: uploadResult.storageId,
      };
    } catch (error) {
      console.error(`[VideoCompositionQueue] Job ${job.id} failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
  {
    connection,
    concurrency: Number.parseInt(
      process.env.VIDEO_COMPOSITION_CONCURRENCY || "2",
      10
    ), // Process 2 videos at a time
    limiter: {
      max: 10, // Max 10 jobs per duration
      duration: 60_000, // Per minute
    },
  }
);

// Log worker events
worker.on("completed", (job) => {
  console.log(`[VideoCompositionQueue] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[VideoCompositionQueue] Job ${job?.id} failed:`, err);
});

worker.on("error", (err) => {
  console.error("[VideoCompositionQueue] Worker error:", err);
});

export async function addVideoCompositionJob(
  data: VideoCompositionJob
): Promise<string> {
  const job = await videoCompositionQueue.add("compose-video", data);
  console.log(`[VideoCompositionQueue] Added job ${job.id}`);
  return job.id || "";
}

export async function getJobStatus(jobId: string): Promise<{
  state: string;
  progress: number;
  result?: VideoCompositionResult;
}> {
  const job = await videoCompositionQueue.getJob(jobId);

  if (!job) {
    throw new Error("Job not found");
  }

  const state = await job.getState();
  const progress = (job.progress as number) || 0;
  const result = job.returnvalue as VideoCompositionResult | undefined;

  return { state, progress, result };
}
