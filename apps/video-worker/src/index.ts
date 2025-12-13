import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  register,
} from "prom-client";
import { initQueue } from "./queue";

const app = new Hono();

// Initialize Prometheus metrics
collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const _videoJobsTotal = new Counter({
  name: "video_jobs_total",
  help: "Total number of video composition jobs",
  labelNames: ["status"],
  registers: [register],
});

const _videoJobsActive = new Gauge({
  name: "video_jobs_active",
  help: "Number of currently active video jobs",
  registers: [register],
});

// Middleware
app.use(logger());

// Metrics middleware
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = (Date.now() - start) / 1000;
  const route = c.req.path;
  const method = c.req.method;
  const status = c.res.status;

  httpRequestDuration.observe({ method, route, status_code: status }, duration);
  httpRequestTotal.inc({ method, route, status_code: status });
});

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
    const { playbackId, overlayImageUrl, overlayText } = body;

    const hasRequiredFields = playbackId && overlayImageUrl && overlayText;
    if (!hasRequiredFields) {
      return c.json(
        {
          error:
            "Missing required fields: playbackId, overlayImageUrl, overlayText",
        },
        400
      );
    }

    // TODO: Add job to queue
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return c.json({
      success: true,
      jobId,
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

    // TODO: Get job status from queue
    return c.json({
      jobId,
      state: "waiting",
      progress: 0,
      result: undefined,
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

// Queue metrics endpoint
app.get("/api/queue/metrics", async (c) => {
  // TODO: Get queue metrics
  return c.json({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
  });
});

// Prometheus metrics endpoint
app.get("/metrics", async (c) => {
  c.header("Content-Type", register.contentType);
  return c.text(await register.metrics());
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
