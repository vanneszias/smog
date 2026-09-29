import { waitUntil } from "cloudflare:workers";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appRouter } from "@smog/api";
import { limitRequests, mapValidationErrors, type RpcContext } from "@smog/rpc";
import { siteEnv } from "./auth";
import { createRpcContext } from "./context";
import { devToolsEnabled } from "./dev-tools";

const RPC_PREFIX = "/api/rpc";
const OPENAPI_PREFIX = "/api/openapi";

const OPENAPI_INFO = { title: "SMOG API", version: "1.0.0" };

// Shared by both transports: RL_API per IP (the old `/rpc/*` limit) and
// typed VALIDATION errors.
const options = {
  clientInterceptors: [mapValidationErrors],
  interceptors: [limitRequests("RL_API", "api")],
};

const rpcHandler = new RPCHandler<RpcContext>(appRouter, options);

const openApiHandler = new OpenAPIHandler<RpcContext>(appRouter, {
  ...options,
  plugins: [
    new OpenAPIReferencePlugin<RpcContext>({
      // The generator behind `/spec.json` and the Scalar reference UI.
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: { info: OPENAPI_INFO },
    }),
  ],
});

async function serve(
  handler: RPCHandler<RpcContext> | OpenAPIHandler<RpcContext>,
  prefix: `/${string}`,
  request: Request
): Promise<Response> {
  const env = siteEnv();
  try {
    const context = await createRpcContext(request, env, { waitUntil });
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
  return serve(rpcHandler, RPC_PREFIX, request);
}

/**
 * `/api/openapi/*`: the OpenAPI transport, the spec (`/spec.json`) and the
 * reference UI (`/api/openapi`). Dev and staging only; 404 in production.
 */
export async function handleOpenApi(request: Request): Promise<Response> {
  if (!devToolsEnabled(siteEnv().vars.ENVIRONMENT)) {
    return new Response(null, { status: 404 });
  }
  return await serve(openApiHandler, OPENAPI_PREFIX, request);
}
