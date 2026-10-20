import { waitUntil } from "cloudflare:workers";
import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "@smog/api";
import { type RpcContext, rpcHandlerOptions } from "@smog/rpc";
import { readCappedBody } from "@smog/utils";
import { siteEnv } from "./auth";
import { createRpcContext } from "./context";
import { apiDocsEnabled } from "./dev-tools";
import { referenceHeaders, referenceScriptResponse } from "./openapi-reference";

type Prefix = `/${string}`;

interface Handler {
  handle: (
    request: Request,
    options: { context: RpcContext; prefix: Prefix }
  ) => Promise<{ matched: boolean; response: Response | undefined }>;
}

const rpcHandler = new RPCHandler<RpcContext>(appRouter, rpcHandlerOptions);

/**
 * The request body cap of both transports (phase 9 task 8, P-10): the
 * largest legitimate input is a guest import or a catalogue batch, well
 * under 1 MiB, and the logo upload has its own route and its 2 MB limit.
 * Past the cap the answer is an empty 413 before any procedure runs.
 */
export const RPC_MAX_BODY_BYTES = 5 * 1024 * 1024;

const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The request itself when its body fits `RPC_MAX_BODY_BYTES`, an empty 413
 * (or 400 for a malformed `content-length`) when it does not. A declared
 * length over the cap is refused without a read; a body without one is
 * counted as it streams and cancelled past the cap (`readCappedBody`), then
 * handed on as a buffered copy.
 */
export async function capRequestBody(
  request: Request
): Promise<Request | Response> {
  if (BODYLESS_METHODS.has(request.method.toUpperCase()) || !request.body) {
    return request;
  }
  const read = await readCappedBody(request, RPC_MAX_BODY_BYTES);
  if (!read.ok) {
    return new Response(null, {
      headers: { "cache-control": "no-store" },
      status: read.status,
    });
  }
  return new Request(request, { body: read.bytes });
}

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
    const capped = await capRequestBody(request);
    if (capped instanceof Response) {
      return capped;
    }
    const context = createRpcContext(capped, siteEnv(), { waitUntil });
    const { matched, response } = await handler.handle(capped, {
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
  const script =
    request.method === "GET"
      ? referenceScriptResponse(new URL(request.url).pathname)
      : null;
  if (script) {
    return script;
  }
  const { openApiHandler } = await import("./openapi");
  const response = await serve(openApiHandler, "/api/openapi", request);
  if (!response.headers.get("content-type")?.startsWith("text/html")) {
    return response;
  }
  // The reference page: its own CSP, which the site-wide headers keep.
  const page = new Response(response.body, response);
  for (const [name, value] of Object.entries(referenceHeaders())) {
    page.headers.set(name, value);
  }
  return page;
}
