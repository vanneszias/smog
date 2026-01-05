import "dotenv/config";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@smog/api/context";
import { appRouter } from "@smog/api/routers/index";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  Counter,
  collectDefaultMetrics,
  Histogram,
  register,
} from "prom-client";
import { startExpirationCronJob } from "./cron";
import { getMasterDownloadUrl } from "./services/mux";
import { handleMollieWebhook } from "./webhooks/mollie";

// ==============================================
// Auth Configuration
// ==============================================
const REFRESH_TOKEN_COOKIE = "workos_refresh_token";
const isProduction = process.env.NODE_ENV === "production";

// Start cron jobs
startExpirationCronJob();

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

const app = new Hono();

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
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// WorkOS OAuth callback endpoint
// Exchanges the authorization code for tokens and stores refresh token securely
app.post("/auth/workos/callback", async (c) => {
  try {
    console.log("[WorkOS] Callback received");
    const body = await c.req.json();
    console.log("[WorkOS] Request body:", body);

    const { code } = body;

    if (!code) {
      console.error("[WorkOS] No code provided");
      return c.json({ error: "Authorization code is required" }, 400);
    }

    const clientId = process.env.WORKOS_CLIENT_ID;
    const clientSecret = process.env.WORKOS_CLIENT_SECRET;

    console.log("[WorkOS] Client ID configured:", !!clientId);
    console.log("[WorkOS] Client Secret configured:", !!clientSecret);

    const hasCredentials = clientId && clientSecret;

    if (!hasCredentials) {
      console.error("[WorkOS] Missing credentials");
      return c.json({ error: "WorkOS credentials not configured" }, 500);
    }

    console.log("[WorkOS] Exchanging code for user info...");

    // Exchange code for user information and tokens
    const response = await fetch(
      "https://api.workos.com/user_management/authenticate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
        }),
      }
    );

    console.log("[WorkOS] WorkOS response status:", response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error("[WorkOS] WorkOS error:", error);
      return c.json({ error: `Failed to authenticate: ${error}` }, 401);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      user: {
        id: string;
        email: string;
        first_name?: string;
        last_name?: string;
        email_verified: boolean;
        profile_picture_url?: string;
        created_at: string;
        updated_at: string;
      };
    };

    console.log("[WorkOS] Successfully authenticated user:", data.user.email);

    // Store refresh token in httpOnly cookie (secure server-side storage for web)
    setCookie(c, REFRESH_TOKEN_COOKIE, data.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Return user info and tokens
    // Web apps use cookies, native apps use the returned tokens
    return c.json({
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
        emailVerified: data.user.email_verified,
        profilePictureUrl: data.user.profile_picture_url,
      },
    });
  } catch (error) {
    console.error("[WorkOS] Callback error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Authentication failed: ${errorMessage}` }, 500);
  }
});

// Secure video master access endpoint
// This endpoint provides temporary download URLs for video files
// Only accessible by authenticated services (video-worker)
app.post("/api/video/master-access", async (c) => {
  try {
    console.log("[Master Access] Request received");

    // Basic authentication check
    // In production, you should use a proper API key or JWT
    const authHeader = c.req.header("Authorization");
    const expectedToken = process.env.VIDEO_WORKER_API_KEY || "dev-secret-key";

    if (authHeader !== `Bearer ${expectedToken}`) {
      console.error("[Master Access] Unauthorized request");
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const { playbackId } = body;

    if (!playbackId) {
      console.error("[Master Access] No playback ID provided");
      return c.json({ error: "playbackId is required" }, 400);
    }

    console.log(
      "[Master Access] Getting master URL for playback ID:",
      playbackId
    );

    // Get temporary master download URL from Mux
    const masterAccess = await getMasterDownloadUrl(playbackId);

    console.log("[Master Access] Master URL generated successfully");
    console.log("[Master Access] URL expires at:", masterAccess.expiresAt);

    return c.json({
      url: masterAccess.url,
      expiresAt: masterAccess.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[Master Access] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json(
      { error: `Failed to get master access URL: ${errorMessage}` },
      500
    );
  }
});

// Mollie webhook endpoint
app.post("/webhooks/mollie", handleMollieWebhook);

// ==============================================
// Secure Auth Token Management (httpOnly cookies)
// ==============================================

// Refresh the access token using the stored refresh token
// This proxies the refresh through the server so the refresh token stays secure
// Supports both cookie-based (web) and body-based (native) refresh tokens
app.post("/auth/token/refresh", async (c) => {
  try {
    // Try to get refresh token from cookie first (web), then from body (native)
    let refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);

    if (!refreshToken) {
      // Try to get from request body (for native apps)
      try {
        const body = await c.req.json();
        refreshToken = body.refreshToken;
      } catch {
        // No body or invalid JSON
      }
    }

    if (!refreshToken) {
      return c.json({ error: "No refresh token found" }, 401);
    }

    const clientId = process.env.WORKOS_CLIENT_ID;

    if (!clientId) {
      return c.json({ error: "WorkOS not configured" }, 500);
    }

    // Call WorkOS to refresh the token
    const response = await fetch(
      "https://api.workos.com/user_management/authenticate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[Auth] WorkOS refresh error:", error);
      // Clear invalid refresh token (cookie only)
      deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: "/" });
      return c.json({ error: "Token refresh failed" }, 401);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      user: {
        id: string;
        email: string;
        first_name?: string;
        last_name?: string;
        email_verified: boolean;
        profile_picture_url?: string;
        created_at: string;
        updated_at: string;
      };
    };

    // Store the new refresh token in cookie (for web clients)
    setCookie(c, REFRESH_TOKEN_COOKIE, data.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Return the access token, refresh token, and user info
    // Native apps need the refresh token to store it securely
    return c.json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
        emailVerified: data.user.email_verified,
        profilePictureUrl: data.user.profile_picture_url,
        createdAt: data.user.created_at,
        updatedAt: data.user.updated_at,
      },
    });
  } catch (error) {
    console.error("[Auth] Token refresh error:", error);
    return c.json({ error: "Failed to refresh token" }, 500);
  }
});

// Clear refresh token cookie (logout)
app.post("/auth/token/clear", async (c) => {
  try {
    deleteCookie(c, REFRESH_TOKEN_COOKIE, {
      path: "/",
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("[Auth] Token clear error:", error);
    return c.json({ error: "Failed to clear token" }, 500);
  }
});

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => c.text("OK"));

// Prometheus metrics endpoint
app.get("/metrics", async (c) => {
  c.header("Content-Type", register.contentType);
  return c.text(await register.metrics());
});

export default app;
