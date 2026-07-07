import "dotenv/config";
import { initOtel } from "@smog/shared/otel";

// Must be called before any loggers are first used so the provider is
// registered before the first log emission hits the OTel API.
initOtel();

import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { render } from "@react-email/render";
import { createContext } from "@smog/api/context";
import { appRouter } from "@smog/api/routers/index";
import {
  exchangeCodeForTokens,
  getWorkOSConfig,
  refreshAccessToken,
} from "@smog/auth/server";
import { api } from "@smog/convex";
import { ConvexHttpClient } from "convex/browser";
import { Hono, type Context as HonoContext } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  startExpirationCronJob,
  startRenewalReminderCronJob,
  startStalePendingPaymentCleanupJob,
} from "./cron";
import {
  PaymentConfirmedEmail,
  RenewalReminderEmail,
  SponsorshipLiveEmail,
  SponsorshipSubmittedEmail,
  WelcomeEmail,
} from "./emails";
import { enqueueEmail, startEmailWorker } from "./services/emailQueue";
import { getMasterDownloadUrl } from "./services/mux";
import { rateLimit } from "./services/rateLimit";
import { handleMollieWebhook } from "./webhooks/mollie";

// ==============================================
// Configuration
// ==============================================
const REFRESH_TOKEN_COOKIE = "smog_refresh_token";
const isProduction = process.env.NODE_ENV === "production";

// Get WorkOS config from environment
const workosConfig = getWorkOSConfig(process.env);

function requireProductionEnv(names: string[]): void {
  if (!isProduction) {
    return;
  }

  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`
    );
  }
}

requireProductionEnv([
  "CONVEX_URL",
  "WORKOS_CLIENT_ID",
  "WORKOS_CLIENT_SECRET",
  "MOLLIE_API_KEY",
  "CORS_ORIGIN",
  "MUX_TOKEN_ID",
  "MUX_TOKEN_SECRET",
  "REMOTION_URL",
  "REMOTION_API_KEY",
  "INTERNAL_API_KEY",
  "SERVER_URL",
  "REDIS_URL",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
]);

if (!(workosConfig.clientId && workosConfig.clientSecret)) {
  console.warn(
    "[Auth] WorkOS credentials not configured - auth endpoints will fail"
  );
}

// Convex client for server-side queries (e.g. new user detection in callback)
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// Start cron jobs
startExpirationCronJob();
startRenewalReminderCronJob();
startStalePendingPaymentCleanupJob();

// Start email queue worker
startEmailWorker();

const app = new Hono();

function getRequiredServiceSecret(
  name: "INTERNAL_API_KEY" | "REMOTION_API_KEY"
) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

const internalApiKey = getRequiredServiceSecret("INTERNAL_API_KEY");
const remotionApiKey = getRequiredServiceSecret("REMOTION_API_KEY");
const openPanelApiUrl =
  process.env.OPENPANEL_API_URL ||
  process.env.VITE_OPENPANEL_API_URL ||
  process.env.EXPO_PUBLIC_OPENPANEL_API_URL ||
  "https://analytics.zias.be/api";
const openPanelClientId =
  process.env.OPENPANEL_CLIENT_ID ||
  process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID ||
  process.env.VITE_OPENPANEL_CLIENT_ID ||
  "";
const openPanelClientSecret =
  process.env.OPENPANEL_CLIENT_SECRET ||
  process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET ||
  "";

const ANALYTICS_TRACK_EVENTS = new Set([
  "gesture_collection_changed",
  "gesture_viewed",
  "screen_view",
  "search_performed",
  "video_playback_completed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("true-client-ip") ||
    forwardedFor ||
    headers.get("x-real-ip") ||
    null
  );
}

async function forwardToOpenPanel(
  body: Record<string, unknown>,
  requestHeaders: Headers
): Promise<void> {
  if (!(openPanelClientId && openPanelClientSecret)) {
    console.warn("[openpanel] Relay credentials are not configured");
    return;
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    "openpanel-client-id": openPanelClientId,
    "openpanel-client-secret": openPanelClientSecret,
    "openpanel-sdk-name": "smog-server-relay",
    "openpanel-sdk-version": "2.0.0",
  });
  const clientIp = getClientIp(requestHeaders);
  const userAgent = requestHeaders.get("user-agent");
  if (clientIp) {
    headers.set("x-client-ip", clientIp);
  }
  if (userAgent) {
    headers.set("user-agent", userAgent);
  }

  try {
    const response = await fetch(`${openPanelApiUrl}/track`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!(response.status === 200 || response.status === 202)) {
      console.error(
        `[openpanel] Relay failed with status ${response.status}:`,
        await response.text()
      );
    }
  } catch (error) {
    console.error("[openpanel] Relay request failed:", error);
  }
}

app.use(
  "/*",
  bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: (c) => c.json({ error: "Request body too large" }, 413),
  })
);
app.use(logger());

app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(
  "/auth/*",
  rateLimit({ namespace: "auth", limit: 30, windowSeconds: 15 * 60 })
);
app.use("/auth/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  await next();
});
app.use(
  "/analytics/track",
  rateLimit({ namespace: "analytics", limit: 120, windowSeconds: 60 })
);
app.use("/rpc/*", async (c, next) => {
  const isRenderOrPaymentRequest = [
    "generatePreview",
    "createBulkSponsorshipsSimplified",
    "createBulkPayment",
    "reSubmitSponsorship",
  ].some((operation) => c.req.path.includes(operation));

  return await rateLimit({
    namespace: isRenderOrPaymentRequest ? "sponsorship" : "rpc",
    limit: isRenderOrPaymentRequest ? 20 : 300,
    windowSeconds: isRenderOrPaymentRequest ? 60 * 60 : 60,
  })(c, next);
});

/**
 * WorkOS OAuth callback endpoint
 * Exchanges the authorization code for tokens
 *
 * For web clients: stores refresh token in httpOnly cookie
 * For native clients: returns refresh token in response body
 */
app.post("/auth/workos/callback", async (c) => {
  try {
    const body: unknown = await c.req.json();
    if (!isRecord(body)) {
      return c.json({ error: "Invalid authentication request" }, 400);
    }
    const { code, codeVerifier } = body;

    if (typeof code !== "string" || code.length === 0 || code.length > 4096) {
      return c.json({ error: "Authorization code is required" }, 400);
    }
    if (
      codeVerifier !== undefined &&
      (typeof codeVerifier !== "string" ||
        codeVerifier.length < 43 ||
        codeVerifier.length > 128)
    ) {
      return c.json({ error: "Invalid PKCE verifier" }, 400);
    }

    if (!(workosConfig.clientId && workosConfig.clientSecret)) {
      return c.json({ error: "WorkOS credentials not configured" }, 500);
    }

    // Exchange code for tokens using shared auth logic
    // Pass codeVerifier for PKCE flow (native apps)
    const result = await exchangeCodeForTokens(
      code,
      workosConfig.clientId,
      workosConfig.clientSecret,
      codeVerifier
    );

    const isNativeClient = typeof codeVerifier === "string" && codeVerifier;

    // Browser refresh tokens stay in an httpOnly cookie. Native clients use
    // PKCE and receive the token for storage in the platform secure store.
    if (!isNativeClient) {
      setCookie(c, REFRESH_TOKEN_COOKIE, result.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    // Check if this is a new user and send welcome email (fire-and-forget)
    // We intentionally don't await this — it must not delay the auth response
    convex
      .query(api.users.getUserByWorkOSId, {
        workosId: result.user.id,
        serviceToken: internalApiKey,
      })
      .then(async (existingUser) => {
        if (!existingUser) {
          await enqueueEmail({
            type: "welcome",
            to: result.user.email,
            name: result.user.firstName ?? undefined,
          });
        }
      })
      .catch((err: unknown) => {
        // Non-critical — log but don't fail the auth response
        console.error("[Auth] Failed to enqueue welcome email:", err);
      });

    // Return tokens and user info
    // Web clients use cookies, native clients use the returned tokens
    return c.json({
      success: true,
      accessToken: result.accessToken,
      ...(isNativeClient && { refreshToken: result.refreshToken }),
      user: result.user,
    });
  } catch (error) {
    console.error("[Auth] Callback error:", error);
    return c.json({ error: "Authentication failed" }, 401);
  }
});

/**
 * Refresh access token endpoint
 *
 * For web clients: reads refresh token from httpOnly cookie
 * For native clients: reads refresh token from request body
 */
app.post("/auth/token/refresh", async (c) => {
  try {
    // Try to get refresh token from cookie first (web), then from body (native)
    let refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);
    const isWebSession = Boolean(refreshToken);

    if (!refreshToken) {
      // Try to get from request body (for native apps)
      try {
        const body = await c.req.json();
        if (
          isRecord(body) &&
          typeof body.refreshToken === "string" &&
          body.refreshToken.length <= 8192
        ) {
          refreshToken = body.refreshToken;
        }
      } catch {
        // No body or invalid JSON
      }
    }

    if (!refreshToken) {
      return c.json({ error: "No refresh token found" }, 401);
    }

    if (!workosConfig.clientId) {
      return c.json({ error: "WorkOS not configured" }, 500);
    }

    // Refresh tokens using shared auth logic
    const result = await refreshAccessToken(
      refreshToken,
      workosConfig.clientId,
      workosConfig.clientSecret
    );

    // Update refresh token cookie (for web clients)
    if (isWebSession) {
      setCookie(c, REFRESH_TOKEN_COOKIE, result.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    // Return new tokens and user info
    return c.json({
      accessToken: result.accessToken,
      ...(!isWebSession && { refreshToken: result.refreshToken }),
      user: result.user,
    });
  } catch (error) {
    console.error("[Auth] Token refresh error:", error);
    // Clear invalid refresh token cookie
    deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: "/" });
    return c.json({ error: "Token refresh failed" }, 401);
  }
});

/**
 * Clear refresh token (logout)
 */
app.post("/auth/token/clear", async (c) => {
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: "/" });
  return c.json({ success: true });
});

// ==============================================
// Analytics Relay
// ==============================================

app.post("/analytics/track", async (c) => {
  try {
    const body = await c.req.json();

    if (!(isRecord(body) && isString(body.type) && isRecord(body.payload))) {
      return c.json({ error: "Invalid analytics payload" }, 400);
    }

    if (body.type === "track") {
      const { name } = body.payload;
      if (!(isString(name) && ANALYTICS_TRACK_EVENTS.has(name))) {
        return c.json({ error: "Unknown analytics event" }, 400);
      }
      await forwardToOpenPanel(
        { type: body.type, payload: body.payload },
        c.req.raw.headers
      );
      return c.json({ success: true }, 202);
    }

    if (body.type === "identify") {
      if (!isString(body.payload.profileId)) {
        return c.json({ error: "Invalid analytics profile" }, 400);
      }
      await forwardToOpenPanel(
        { type: body.type, payload: body.payload },
        c.req.raw.headers
      );
      return c.json({ success: true }, 202);
    }

    return c.json({ error: "Unsupported analytics payload" }, 400);
  } catch (error) {
    console.error("[openpanel] Failed to handle analytics payload:", error);
    return c.json({ success: true }, 202);
  }
});

// ==============================================
// Video Master Access Endpoint
// ==============================================

/**
 * Secure video master access endpoint
 * Provides temporary download URLs for video files
 * Only accessible by authenticated services (Remotion)
 */
app.post("/api/video/master-access", async (c) => {
  try {
    // Basic authentication check
    const authHeader = c.req.header("Authorization");
    if (authHeader !== `Bearer ${remotionApiKey}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const { playbackId } = body;

    if (!playbackId) {
      return c.json({ error: "playbackId is required" }, 400);
    }

    // Get temporary master download URL from Mux
    const masterAccess = await getMasterDownloadUrl(playbackId);

    return c.json({
      url: masterAccess.url,
      expiresAt: masterAccess.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[Master Access] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json(
      { error: `Failed to get master access URL: ${message}` },
      500
    );
  }
});

// ==============================================
// Webhooks
// ==============================================

app.post("/webhooks/mollie", handleMollieWebhook);

// ==============================================
// Internal Email Trigger Endpoint
// Used by Convex actions (e.g. welcome email on user creation)
// ==============================================

/**
 * Internal email trigger endpoint
 * Accepts a POST request from trusted internal services (Convex actions)
 * to enqueue transactional emails.
 *
 * Secured with INTERNAL_API_KEY env var (same mechanism as REMOTION_API_KEY)
 */
app.post("/api/email/trigger", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (authHeader !== `Bearer ${internalApiKey}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const job = await c.req.json();

    if (!(job?.type && job?.to)) {
      return c.json({ error: "Invalid email job payload" }, 400);
    }

    await enqueueEmail(job);

    return c.json({ success: true });
  } catch (error) {
    console.error("[Email Trigger] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// ==============================================
// Email Preview Endpoint (admin only)
// ==============================================

/**
 * Render an email template with sample data and return the HTML.
 * Read-only endpoint with hardcoded sample data, restricted to admins.
 *
 * GET /api/email/preview/:template
 */

const EMAIL_PREVIEW_SAMPLES = {
  welcome: () => WelcomeEmail({ name: "Jan Janssen" }),
  sponsorship_submitted: () =>
    SponsorshipSubmittedEmail({
      sponsorName: "Acme BV",
      gestureName: "Hond",
    }),
  payment_confirmed: () =>
    PaymentConfirmedEmail({
      sponsorName: "Acme BV",
      gestureName: "Hond",
      paymentAmount: 5000, // €50.00 in cents
    }),
  sponsorship_live: () =>
    SponsorshipLiveEmail({
      sponsorName: "Acme BV",
      gestureName: "Hond",
      startDate: Date.now(),
      endDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
    }),
  renewal_reminder: () =>
    RenewalReminderEmail({
      sponsorName: "Acme BV",
      gestureName: "Hond",
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }),
} as const;

type EmailPreviewTemplate = keyof typeof EMAIL_PREVIEW_SAMPLES;

async function isAdminRequest(c: HonoContext): Promise<boolean> {
  const context = await createContext({ context: c });
  if (!context.workosId) {
    return false;
  }

  const user = await convex.query(api.users.getUserByWorkOSId, {
    workosId: context.workosId,
    serviceToken: internalApiKey,
  });

  return user?.role === "admin";
}

app.get("/api/email/preview/:template", async (c) => {
  if (!(await isAdminRequest(c))) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const template = c.req.param("template") as EmailPreviewTemplate;

  if (!(template in EMAIL_PREVIEW_SAMPLES)) {
    return c.json(
      {
        error: `Unknown template "${template}". Valid templates: ${Object.keys(EMAIL_PREVIEW_SAMPLES).join(", ")}`,
      },
      400
    );
  }

  const html = await render(EMAIL_PREVIEW_SAMPLES[template]());

  return c.html(html);
});

// ==============================================
// API Routes (oRPC)
// ==============================================

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

// ==============================================
// Health Check
// ==============================================

app.get("/", (c) => c.text("OK"));
app.get("/health", (c) => c.text("OK"));

export default app;
