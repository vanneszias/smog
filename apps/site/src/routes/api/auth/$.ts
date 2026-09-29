import { checkRateLimit } from "@smog/rpc";
import { createFileRoute } from "@tanstack/react-router";
import { getAuth, siteEnv } from "../../../server/auth";
import { clientIp } from "../../../server/context";

async function handle({ request }: { request: Request }): Promise<Response> {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    console.error("[auth] Failed to handle an auth request:", error);
    throw error;
  }
}

/**
 * POSTs (sign-in, sign-up, codes, resets) go through `RL_AUTH` per IP
 * first: Better Auth's own KV limiter is only approximate.
 */
async function handlePost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  const { RL_AUTH } = siteEnv().rateLimits;
  if (!(await checkRateLimit(RL_AUTH, `auth:${clientIp(request)}`))) {
    return Response.json(
      { code: "RATE_LIMITED" },
      { headers: { "retry-after": "60" }, status: 429 }
    );
  }
  return await handle({ request });
}

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handle, POST: handlePost } },
});
