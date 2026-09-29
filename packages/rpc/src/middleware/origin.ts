import { ORPCError } from "@orpc/server";
import type { RpcEnv } from "../context";
import { ERRORS } from "../errors";

type OriginEnv = Pick<RpcEnv, "ENVIRONMENT" | "SITE_URL">;

const SAFE_METHODS = new Set(["GET", "HEAD"]);
const TRUSTED_FETCH_SITES = new Set(["none", "same-origin"]);
const DEV_LOCALHOST = /^http:\/\/localhost(?::\d+)?$/;

/**
 * Whether a state-changing request comes from another origin (CSRF defence
 * in depth on top of the SameSite=Lax session cookie, DECISIONS 2026-09-29):
 * - `Sec-Fetch-Site` present and neither `same-origin` nor `none`, or
 * - `Origin` present and not the `SITE_URL` origin (any `http://localhost`
 *   port is also accepted in `dev`).
 *
 * GET and HEAD are never checked; a request with neither header (the native
 * app, curl) carries no ambient cookie and passes. Reused by every
 * cookie-authenticated POST endpoint outside oRPC (the phase 4 analytics relay).
 */
export function isForeignRequest(request: Request, env: OriginEnv): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && !TRUSTED_FETCH_SITES.has(fetchSite)) {
    return true;
  }
  const origin = request.headers.get("origin");
  if (origin === null || origin === new URL(env.SITE_URL).origin) {
    return false;
  }
  return !(env.ENVIRONMENT === "dev" && DEV_LOCALHOST.test(origin));
}

interface OriginCheckedContext {
  env: OriginEnv;
  request: Request;
}

/**
 * A handler interceptor (`interceptors`, first) that answers a foreign
 * state-changing request with a defined `FORBIDDEN` before the rate limit,
 * the session read or any procedure runs.
 */
export async function checkOrigin<T>(options: {
  context: OriginCheckedContext;
  next: () => Promise<T>;
}): Promise<T> {
  const { env, request } = options.context;
  if (isForeignRequest(request, env)) {
    throw new ORPCError("FORBIDDEN", {
      defined: true,
      status: ERRORS.FORBIDDEN.status,
    });
  }
  return await options.next();
}
