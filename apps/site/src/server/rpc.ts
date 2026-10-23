import { waitUntil } from "cloudflare:workers";
import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "@smog/api";
import { type RpcContext, rpcHandlerOptions } from "@smog/rpc";
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
 * The request body cap of both transports (phase 9 task 8, P-10), the one
 * constant. It is 5 MiB, not 1 MiB, on purpose: the guest import's contract
 * allows 100 lists of 500 gesture ids and 1000 favorites (about 3.5 MB at
 * the worst), so 1 MiB could refuse a contract-valid input. The logo upload
 * has its own route and its 2 MB limit. Past the cap the answer is an empty
 * 413 and no procedure runs.
 */
export const RPC_MAX_BODY_BYTES = 5 * 1024 * 1024;

const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DIGITS = /^\d{1,15}$/;

function refusal(status: 400 | 413): Response {
  return new Response(null, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

export interface CappedRequest {
  /** Whether the body went past the cap while it was read (the 413 case). */
  exceeded: () => boolean;
  request: Request;
}

/**
 * The request to hand on, or an empty refusal. A declared `content-length`
 * over the cap is refused at once (413; a malformed one is 400), and a
 * declared body within it passes untouched (the runtime enforces the
 * length). A body with no declared length is **not buffered here**: it
 * flows through a counting stream that errors past the cap, so nothing is
 * held, and nothing copied, before the origin check, the `RL_API` limit and
 * the session read have run; the handler buffers only what a procedure that
 * got that far reads. `exceeded()` tells `serve` to answer 413 when that
 * stream failed the read.
 */
export function capRequestBody(request: Request): CappedRequest | Response {
  if (BODYLESS_METHODS.has(request.method.toUpperCase()) || !request.body) {
    return { exceeded: () => false, request };
  }
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!DIGITS.test(declared)) {
      return refusal(400);
    }
    if (Number.parseInt(declared, 10) > RPC_MAX_BODY_BYTES) {
      return refusal(413);
    }
    return { exceeded: () => false, request };
  }
  let size = 0;
  let exceeded = false;
  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > RPC_MAX_BODY_BYTES) {
          exceeded = true;
          controller.error(
            new RangeError("[rpc] The request body is too large")
          );
          return;
        }
        controller.enqueue(chunk);
      },
    })
  );
  return {
    exceeded: () => exceeded,
    request: new Request(request, {
      body: counted,
      duplex: "half",
    } as RequestInit),
  };
}

/**
 * Both transports share `rpcHandlerOptions`: `RL_API` per IP, then the
 * session (one D1 read, only when the limit passed), then the procedure.
 * An error that escapes is logged once, redacted, by the Worker's top level
 * (`[error] fetch`), so it is not logged here as well.
 */
async function serve(
  handler: Handler,
  prefix: Prefix,
  request: Request
): Promise<Response> {
  const capped = capRequestBody(request);
  if (capped instanceof Response) {
    return capped;
  }
  const context = createRpcContext(capped.request, siteEnv(), { waitUntil });
  try {
    const { matched, response } = await handler.handle(capped.request, {
      context,
      prefix,
    });
    if (capped.exceeded()) {
      return refusal(413);
    }
    return matched && response ? response : new Response(null, { status: 404 });
  } catch (error) {
    if (capped.exceeded()) {
      return refusal(413);
    }
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
