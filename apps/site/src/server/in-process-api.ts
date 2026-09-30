import { waitUntil } from "cloudflare:workers";
import { createRouterClient } from "@orpc/server";
import { appRouter } from "@smog/api";
import type { ApiClient } from "@smog/api/client";
import type { RpcContext } from "@smog/rpc";
import { getRequest } from "@tanstack/react-start/server";
import { siteEnv } from "./auth";
import { createRpcContext } from "./context";
import { requestSession } from "./session";

/**
 * The rpc context of the request being rendered, as `/api/rpc` builds it
 * (session, db, kv, locale). The session is the one the shell read.
 */
async function renderContext(): Promise<RpcContext> {
  const request = getRequest();
  const context = createRpcContext(request, siteEnv(), { waitUntil });
  return { ...context, session: await requestSession(request) };
}

/**
 * SSR loaders call the procedures in-process (no HTTP round trip to
 * SITE_URL), with the same router, validation and errors as `/api/rpc`.
 * The transport's `RL_API` limit and origin check do not apply: they
 * guard the HTTP endpoint, and a page render is already one request.
 */
export function createInProcessApiClient(): ApiClient {
  return createRouterClient(appRouter, { context: renderContext });
}
