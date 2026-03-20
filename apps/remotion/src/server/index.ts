/**
 * Remotion Video Composition Server
 * Replaces the FFmpeg-based video-worker with Remotion rendering
 */

import { resolve } from "node:path";
import { config } from "dotenv";

// Load env vars from root .env (shared across all apps)
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { processComposition } from "./compose";
import { createJob, getJob, getQueueStats } from "./jobs";

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

// Health check endpoints
app.get("/", (c) => c.text("Remotion Video Composer - Ready"));

app.get("/health", (c) =>
  c.json({
    status: "healthy",
    service: "remotion",
    timestamp: new Date().toISOString(),
    renderer: "remotion",
  })
);

// Video composition endpoints
app.post("/api/compose", async (c) => {
  try {
    const body = await c.req.json();
    const { playbackId, overlayImageUrl, overlayText, overlayConfig } = body;

    if (!(playbackId && overlayText)) {
      return c.json(
        {
          error: "Missing required fields: playbackId, overlayText",
        },
        400
      );
    }

    // Validate sponsor name length
    if (overlayText.length > 35) {
      return c.json(
        {
          error: "Sponsor name must be 35 characters or less",
        },
        400
      );
    }

    // Create job
    const job = createJob({
      playbackId,
      overlayImageUrl,
      overlayText,
      overlayConfig,
    });

    console.log(
      `[Remotion] Job ${job.id} created for playback ID: ${playbackId}`
    );

    // Start processing in the background (don't await)
    processComposition(job.id, job.data).catch((error) => {
      console.error(`[Remotion] Background job ${job.id} failed:`, error);
    });

    return c.json({
      success: true,
      jobId: job.id,
      message: "Video composition job started",
    });
  } catch (error) {
    console.error("[Remotion] Compose error:", error);
    return c.json(
      {
        error: "Failed to start video composition",
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

    const job = getJob(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({
      jobId: job.id,
      state: job.state,
      progress: job.progress,
      result: job.result,
    });
  } catch (error) {
    console.error("[Remotion] Status check error:", error);
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
    const stats = getQueueStats();
    return c.json(stats);
  } catch (error) {
    console.error("[Remotion] Queue status error:", error);
    return c.json(
      {
        error: "Failed to get queue status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

const port = Number(process.env.PORT) || 3002;

console.log(`[Remotion] Starting server on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};
