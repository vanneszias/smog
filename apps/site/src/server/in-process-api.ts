import { waitUntil } from "cloudflare:workers";
import { ORPCError } from "@orpc/client";
import { createRouterClient } from "@orpc/server";
import { appRouter } from "@smog/api";
import type { ApiClient } from "@smog/api/client";
import {
  checkRateLimit,
  ERRORS,
  type RateLimiter,
  type RpcContext,
} from "@smog/rpc";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { siteEnv } from "./auth";
import { clientIp, createRpcContext } from "./context";
import { requestSession } from "./session";

const renders = new WeakMap<Request, Promise<boolean>>();

/**
 * Whether this page render may call procedures: `RL_API` asked once per
 * request with the key `/api/rpc` uses (`api:<ip>`), however many
 * procedures the loaders call.
 */
export function limitRender(
  request: Request,
  limiter: RateLimiter
): Promise<boolean> {
  let allowed = renders.get(request);
  if (!allowed) {
    allowed = checkRateLimit(limiter, `api:${clientIp(request)}`);
    renders.set(request, allowed);
  }
  return allowed;
}

/**
 * The rpc context of the request being rendered, as `/api/rpc` builds it
 * (session, db, kv, locale), after the render's `RL_API` check. Over the
 * limit, the page answers 429 and every in-process call is `RATE_LIMITED`
 * (the loaders' queries stay empty; nothing expensive runs).
 */
async function renderContext(): Promise<RpcContext> {
  const request = getRequest();
  const env = siteEnv();
  if (!(await limitRender(request, env.rateLimits.RL_API))) {
    setResponseStatus(ERRORS.RATE_LIMITED.status);
    throw new ORPCError("RATE_LIMITED", {
      defined: true,
      status: ERRORS.RATE_LIMITED.status,
    });
  }
  const context = createRpcContext(request, env, { waitUntil });
  return { ...context, session: await requestSession(request) };
}

/**
 * SSR loaders call the procedures in-process (no HTTP round trip to
 * SITE_URL), with the same router, validation, errors and `RL_API` limit
 * as `/api/rpc`. Only the origin check is skipped: loaders only read.
 */
export function createInProcessApiClient(): ApiClient {
  return createRouterClient(appRouter, { context: renderContext });
}
