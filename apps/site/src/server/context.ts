import { createDb } from "@smog/db/client";
import { resolveLocale } from "@smog/i18n";
import type { RpcContext } from "@smog/rpc";
import { parseCookie } from "cookie-es";
import { getAuth, type SiteEnv } from "./auth";

/** The client IP Cloudflare saw (`unknown` locally, where there is no edge). */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/** The `locale` cookie, then Accept-Language, then `nl`. */
function requestLocale(request: Request): RpcContext["locale"] {
  const cookies = parseCookie(request.headers.get("cookie") ?? "");
  return resolveLocale({
    acceptLanguage: request.headers.get("accept-language"),
    cookie: cookies.locale ?? null,
  });
}

/**
 * The rpc context for one request, without any I/O. `session` starts as
 * `null`: the handlers' `loadSession` interceptor reads it once, after the
 * `RL_API` limit passed (`rpcHandlerOptions` in `@smog/rpc`).
 */
export function createRpcContext(
  request: Request,
  env: SiteEnv,
  ctx: { waitUntil: (promise: Promise<unknown>) => void }
): RpcContext {
  return {
    auth: getAuth(),
    db: createDb(env.db),
    env: {
      ...env.worker,
      ...env.rateLimits,
      EMAIL_QUEUE: env.bindings.EMAIL_QUEUE,
      EVENTS_QUEUE: env.bindings.EVENTS_QUEUE,
      MEDIA: env.bindings.MEDIA,
    },
    ip: clientIp(request),
    kv: env.kv,
    locale: requestLocale(request),
    request,
    session: null,
    waitUntil: (promise) => ctx.waitUntil(promise),
  };
}
