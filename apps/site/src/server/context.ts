import { getSession } from "@smog/auth";
import { createDb } from "@smog/db/client";
import { resolveLocale } from "@smog/i18n";
import type { RpcContext } from "@smog/rpc";
import { getCookie } from "@tanstack/react-start/server";
import { getAuth, type SiteEnv } from "./auth";

/** The client IP Cloudflare saw (`unknown` locally, where there is no edge). */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/**
 * The rpc context for one request: the session is read once here, the
 * locale comes from the `locale` cookie, then Accept-Language.
 */
export async function createRpcContext(
  request: Request,
  env: SiteEnv,
  ctx: { waitUntil: (promise: Promise<unknown>) => void }
): Promise<RpcContext> {
  const auth = getAuth();
  try {
    return {
      auth,
      db: createDb(env.db),
      env: { ...env.worker, ...env.rateLimits },
      ip: clientIp(request),
      locale: resolveLocale({
        acceptLanguage: request.headers.get("accept-language"),
        cookie: getCookie("locale") ?? null,
      }),
      request,
      session: await getSession(auth, request.headers),
      waitUntil: (promise) => ctx.waitUntil(promise),
    };
  } catch (error) {
    console.error("[rpc] Failed to create the request context:", error);
    throw error;
  }
}
