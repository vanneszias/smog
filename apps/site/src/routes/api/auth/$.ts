import { checkRateLimit } from "@smog/rpc";
import { createFileRoute } from "@tanstack/react-router";
import { getAuth, siteEnv } from "../../../server/auth";
import { clientIp } from "../../../server/context";

/**
 * POSTs that never need a limit: signing out and reading the session only
 * act on the caller's own cookie.
 */
const UNLIMITED_POSTS = new Set([
  "/api/auth/sign-out",
  "/api/auth/get-session",
]);

async function handle({ request }: { request: Request }): Promise<Response> {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    console.error("[auth] Failed to handle an auth request:", error);
    throw error;
  }
}

/**
 * Other POSTs (sign-in, sign-up, codes, resets, account changes) go
 * through `RL_AUTH` per IP first: Better Auth's own limiter is a memory
 * counter per isolate, so it is not a real limit on Workers.
 */
async function handlePost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  if (!UNLIMITED_POSTS.has(new URL(request.url).pathname)) {
    const { RL_AUTH } = siteEnv().rateLimits;
    if (!(await checkRateLimit(RL_AUTH, `auth:${clientIp(request)}`))) {
      return Response.json(
        { code: "RATE_LIMITED" },
        { headers: { "retry-after": "60" }, status: 429 }
      );
    }
  }
  return await handle({ request });
}

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handle, POST: handlePost } },
});
