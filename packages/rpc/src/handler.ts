import type { StandardHandlerOptions } from "@orpc/server/standard";
import { getSession } from "@smog/auth";
import type { RpcContext } from "./context";
import { limitRequests } from "./middleware/rate-limit";
import { mapValidationErrors } from "./validation";

type HandlerOptions = StandardHandlerOptions<RpcContext>;
type HandlerInterceptor = NonNullable<HandlerOptions["interceptors"]>[number];

/**
 * A handler interceptor that reads the session (once per request) into the
 * context. It runs after `limitRequests`, so a rate-limited request never
 * costs a session lookup.
 */
export const loadSession: HandlerInterceptor = async (options) => {
  const { context } = options;
  const session = await getSession(context.auth, context.request.headers);
  return await options.next({ ...options, context: { ...context, session } });
};

/**
 * The options both transports use (`new RPCHandler(appRouter, rpcHandlerOptions)`,
 * the same for `OpenAPIHandler`): `RL_API` per IP first, then the session,
 * and typed `VALIDATION` errors. The context passed to `handle()` carries
 * `session: null`; `loadSession` fills it.
 */
export const rpcHandlerOptions: Pick<
  HandlerOptions,
  "clientInterceptors" | "interceptors"
> = {
  clientInterceptors: [mapValidationErrors],
  interceptors: [limitRequests("RL_API", "api"), loadSession],
};
