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
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { startExpirationCronJob, startRenewalReminderCronJob } from "./cron";
import {
  PaymentConfirmedEmail,
  RenewalReminderEmail,
  SponsorshipLiveEmail,
  SponsorshipSubmittedEmail,
  WelcomeEmail,
} from "./emails";
import { enqueueEmail, startEmailWorker } from "./services/emailQueue";
import { getMasterDownloadUrl } from "./services/mux";
import { handleMollieWebhook } from "./webhooks/mollie";

// ==============================================
// Configuration
// ==============================================
const REFRESH_TOKEN_COOKIE = "smog_refresh_token";
const isProduction = process.env.NODE_ENV === "production";

// Get WorkOS config from environment
const workosConfig = getWorkOSConfig(process.env);

// Validate required config
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

// Start email queue worker
startEmailWorker();

const app = new Hono();

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

/**
 * WorkOS OAuth callback endpoint
 * Exchanges the authorization code for tokens
 *
 * For web clients: stores refresh token in httpOnly cookie
 * For native clients: returns refresh token in response body
 */
app.post("/auth/workos/callback", async (c) => {
  try {
    const body = await c.req.json();
    const { code, codeVerifier } = body;

    if (!code) {
      return c.json({ error: "Authorization code is required" }, 400);
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

    // Store refresh token in httpOnly cookie (for web clients)
    setCookie(c, REFRESH_TOKEN_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Check if this is a new user and send welcome email (fire-and-forget)
    // We intentionally don't await this — it must not delay the auth response
    convex
      .query(api.users.getUserByWorkOSId, { workosId: result.user.id })
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
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    console.error("[Auth] Callback error:", error);
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    return c.json({ error: message }, 500);
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
    setCookie(c, REFRESH_TOKEN_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Return new tokens and user info
    return c.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
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
    const expectedToken = process.env.REMOTION_API_KEY || "dev-secret-key";

    if (authHeader !== `Bearer ${expectedToken}`) {
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
    const expectedKey = process.env.INTERNAL_API_KEY ?? "dev-internal-secret";

    if (authHeader !== `Bearer ${expectedKey}`) {
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
 * Read-only endpoint with hardcoded sample data — no sensitive information.
 * CORS middleware already restricts this to CORS_ORIGIN.
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

app.get("/api/email/preview/:template", async (c) => {
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
