import { waitUntil } from "cloudflare:workers";
import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "@smog/api";
import { type RpcContext, rpcHandlerOptions } from "@smog/rpc";
import { siteEnv } from "./auth";
import { createRpcContext } from "./context";
import { apiDocsEnabled } from "./dev-tools";

type Prefix = `/${string}`;

interface Handler {
  handle: (
    request: Request,
    options: { context: RpcContext; prefix: Prefix }
  ) => Promise<{ matched: boolean; response: Response | undefined }>;
}

const rpcHandler = new RPCHandler<RpcContext>(appRouter, rpcHandlerOptions);

/**
 * Both transports share `rpcHandlerOptions`: `RL_API` per IP, then the
 * session (one D1 read, only when the limit passed), then the procedure.
 */
async function serve(
  handler: Handler,
  prefix: Prefix,
  request: Request
): Promise<Response> {
  try {
    const context = createRpcContext(request, siteEnv(), { waitUntil });
    const { matched, response } = await handler.handle(request, {
      context,
      prefix,
    });
    return matched && response ? response : new Response(null, { status: 404 });
  } catch (error) {
    console.error(`[rpc] Failed to handle ${prefix}:`, error);
    throw error;
  }
}

/** `/api/rpc/*`: the RPC transport both apps use. */
export function handleRpc(request: Request): Promise<Response> {
  return serve(rpcHandler, "/api/rpc", request);
}

/**
 * `/api/openapi/*`: the OpenAPI transport, the spec (`/spec.json`) and the
 * reference UI (`/api/openapi`). Dev and staging only; 404 in production,
 * where the OpenAPI handler, the Zod converter and Scalar are never loaded.
 */
export async function handleOpenApi(request: Request): Promise<Response> {
  if (!apiDocsEnabled(siteEnv().vars.ENVIRONMENT)) {
    return new Response(null, { status: 404 });
  }
  const { openApiHandler } = await import("./openapi");
  return await serve(openApiHandler, "/api/openapi", request);
}
