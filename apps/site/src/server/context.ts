import { createDb } from "@smog/db/client";
import { matchLocale, resolveLocale } from "@smog/i18n";
import type { RpcContext } from "@smog/rpc";
import { parseCookie } from "cookie-es";
import { getAuth, type SiteEnv } from "./auth";
import { enabledLanguageCodes } from "./catalogue";

/** The client IP Cloudflare saw (`unknown` locally, where there is no edge). */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/**
 * The `locale` cookie, then Accept-Language, then the default: only an
 * enabled language counts (`enabled`, the `language` table's enabled rows;
 * the shipped three where the caller has none), so a disabled language in a
 * cookie never reaches an email or a payment.
 */
function requestLocale(
  request: Request,
  enabled?: readonly string[],
  accountLocale: string | null = null
): RpcContext["locale"] {
  const cookies = parseCookie(request.headers.get("cookie") ?? "");
  const cookie = cookies.locale ?? null;
  return resolveLocale(
    {
      acceptLanguage: request.headers.get("accept-language"),
      cookie,
      // This browser's choice (an enabled cookie) first; else the account's.
      preference: matchLocale(cookie, enabled) ? null : accountLocale,
    },
    enabled
  );
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
    // The shipped three until the session is known; `localeFor` then reads the
    // enabled languages (after the rate limit, not before it).
    locale: requestLocale(request),
    localeFor: async (accountLocale) =>
      requestLocale(request, await enabledLanguageCodes(), accountLocale),
    request,
    session: null,
    waitUntil: (promise) => ctx.waitUntil(promise),
  };
}
