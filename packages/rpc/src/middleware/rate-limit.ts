import { ORPCError, os } from "@orpc/server";
import type { RateLimitBinding, RateLimiter, RpcEnv } from "../context";
import { ERRORS } from "../errors";

/**
 * Asks a Workers Rate Limiting binding whether `key` may go on. Shared by
 * the rpc middleware and the site's `/api/auth/*` route.
 */
export async function checkRateLimit(
  limiter: RateLimiter,
  key: string
): Promise<boolean> {
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch (error) {
    console.error("[rpc] Failed to check a rate limit:", error);
    throw error;
  }
}

/**
 * `defined: true` because the handler-level limit runs outside any
 * procedure, where oRPC would not mark it; every contract declares it.
 */
function rateLimited(): ORPCError<"RATE_LIMITED", unknown> {
  return new ORPCError("RATE_LIMITED", {
    defined: true,
    status: ERRORS.RATE_LIMITED.status,
  });
}

export interface LimitedContext {
  env: Pick<RpcEnv, RateLimitBinding>;
  ip: string;
}

/**
 * A handler interceptor (`interceptors`) that limits every request of a
 * transport per IP, keyed by `<scope>:<ip>`, before any procedure runs:
 * `new RPCHandler(appRouter, { interceptors: [limitRequests("RL_API", "api")] })`.
 */
export function limitRequests(binding: RateLimitBinding, scope: string) {
  return async <T>(options: {
    context: LimitedContext;
    next: () => Promise<T>;
  }): Promise<T> => {
    const { env, ip } = options.context;
    if (!(await checkRateLimit(env[binding], `${scope}:${ip}`))) {
      throw rateLimited();
    }
    return await options.next();
  };
}

/**
 * Limits a procedure with one of the rate-limit bindings, keyed by
 * `<ip>:<procedure path>`; throws `RATE_LIMITED` when over the limit.
 */
export function rateLimit(binding: RateLimitBinding) {
  return os
    .$context<LimitedContext>()
    .middleware(async ({ context, next, path }) => {
      const key = `${context.ip}:${path.join(".")}`;
      if (!(await checkRateLimit(context.env[binding], key))) {
        throw rateLimited();
      }
      return await next();
    });
}
