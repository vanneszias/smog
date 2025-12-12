import "dotenv/config";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@smog/api/context";
import { appRouter } from "@smog/api/routers/index";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

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

// WorkOS OAuth callback endpoint
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

    // Exchange code for user information
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
      user: {
        id: string;
        email: string;
        first_name?: string;
        last_name?: string;
      };
    };

    console.log("[WorkOS] Successfully authenticated user:", data.user.email);

    return c.json({
      workosId: data.user.id,
      email: data.user.email,
      firstName: data.user.first_name,
      lastName: data.user.last_name,
    });
  } catch (error) {
    console.error("[WorkOS] Callback error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Authentication failed: ${errorMessage}` }, 500);
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

export default app;
