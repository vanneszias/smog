import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initQueue, videoQueue } from "./queue";

const app = new Hono();

// Middleware
app.use(logger());

app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

// Health check endpoint
app.get("/", (c) => c.text("Video Worker Service - Ready"));

app.get("/health", (c) =>
  c.json({
    status: "healthy",
    service: "video-worker",
    timestamp: new Date().toISOString(),
    redis: process.env.REDIS_HOST || "not configured",
    concurrency: process.env.VIDEO_COMPOSITION_CONCURRENCY || 2,
  })
);

// Video composition endpoints
app.post("/api/compose", async (c) => {
  try {
    const body = await c.req.json();
    const { playbackId, overlayImageUrl, overlayText, overlayConfig } = body;

    // overlayImageUrl is optional (can be empty for text-only overlays)
    if (!(playbackId && overlayText)) {
      return c.json(
        {
          error: "Missing required fields: playbackId, overlayText",
        },
        400
      );
    }

    // Add job to queue (overlayConfig is optional, will use defaults if not provided)
    const job = await videoQueue.add("compose-video", {
      playbackId,
      overlayImageUrl,
      overlayText,
      overlayConfig, // Optional: custom positioning and styling
    });

    console.log(`[Video Worker] Job ${job.id} added to queue`);

    return c.json({
      success: true,
      jobId: job.id,
      message: "Video composition job queued",
    });
  } catch (error) {
    console.error("[Video Worker] Compose error:", error);
    return c.json(
      {
        error: "Failed to queue video composition",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

app.get("/api/compose/status/:jobId", async (c) => {
  try {
    const jobId = c.req.param("jobId");

    if (!jobId) {
      return c.json({ error: "Job ID is required" }, 400);
    }

    // Get job from queue
    const job = await videoQueue.getJob(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    const state = await job.getState();
    const progress = job.progress || 0;
    const returnValue = job.returnvalue;

    return c.json({
      jobId: job.id,
      state,
      progress,
      result: returnValue,
    });
  } catch (error) {
    console.error("[Video Worker] Status check error:", error);
    return c.json(
      {
        error: "Failed to get job status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Queue info endpoint
app.get("/api/queue/status", async (c) => {
  try {
    const waiting = await videoQueue.getWaitingCount();
    const active = await videoQueue.getActiveCount();
    const completed = await videoQueue.getCompletedCount();
    const failed = await videoQueue.getFailedCount();

    return c.json({
      waiting,
      active,
      completed,
      failed,
    });
  } catch (error) {
    console.error("[Video Worker] Queue status error:", error);
    return c.json(
      {
        error: "Failed to get queue status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Initialize queue on startup
try {
  console.log("[Video Worker] Initializing queue...");
  initQueue();
  console.log("[Video Worker] Queue initialized successfully");
} catch (error) {
  console.error("[Video Worker] Failed to initialize queue:", error);
}

const port = process.env.PORT || 3002;

export default {
  port,
  fetch: app.fetch,
};
