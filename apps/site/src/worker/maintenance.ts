import {
  BYPASS_VERSION_INITIAL,
  MAINTENANCE_KV_KEY,
  type MaintenanceSetting,
  parseMaintenanceSetting,
} from "@smog/admin/schema";
import { AuthError, getSession, requireAdminUser } from "@smog/auth";
import type { Environment } from "@smog/config/env/worker";
import { checkRateLimit, isForeignRequest } from "@smog/rpc";
import { parseCookie } from "cookie-es";
import { getAuth, siteEnv } from "@/server/auth";
import { clientIp } from "@/server/context";
import { maintenanceResponse } from "./maintenance-page";

/**
 * Maintenance mode (spec §9). The KV key `maintenance` holds a
 * `MaintenanceSetting` (`@smog/admin/schema`, the one definition);
 * `admin.maintenance.set` (the admin settings page) and `bun run
 * maintenance` write it. While it is enabled,
 * the Worker answers every request with a 503, except:
 * - `/api/webhooks/*`, `/api/health`, `/.well-known/*` and `/api/analytics`;
 * - the `/sign-in` page and `AUTH_SIGN_IN_ROUTES`, so an existing admin
 *   can sign in (served by a sign-in-only Better Auth: no sign-up, no
 *   reset, no email to an unknown address);
 * - `POST /api/maintenance/bypass`, where a signed-in admin gets the bypass
 *   cookie;
 * - requests with a valid bypass cookie.
 *
 * `bypassVersion` changes only when maintenance is turned off
 * (`nextBypassVersion`), so a cookie fetched before or during a
 * window lasts for that window and dies with it. Cookies are signed and
 * checked against a fresh KV read, never the isolate cache.
 */

export const BYPASS_COOKIE = "smog_mx";
export const BYPASS_PATH = "/api/maintenance/bypass";

/** The isolate cache; KV itself is read with its 30 s minimum `cacheTtl`. */
const CACHE_MS = 30_000;
const KV_CACHE_TTL_S = 30;
const DEFAULT_RETRY_AFTER_S = 600;
const BYPASS_TTL_S = 12 * 60 * 60;
const EXP_DIGITS = /^\d{1,12}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;
const PADDING = /[=]+$/;

let cache: { expiresAt: number; state: MaintenanceSetting | null } | undefined;

/** Forgets the cached state (tests; the next read goes to KV). */
export function clearMaintenanceCache(): void {
  cache = undefined;
}

/**
 * The current state, cached for 30 s per isolate (`fresh` skips that cache
 * and refreshes it). A KV failure keeps the site up: it is logged, and the
 * last known state (or "off") stands until the next read.
 */
async function readMaintenance(
  kv: KVNamespace,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<MaintenanceSetting | null> {
  const now = Date.now();
  if (!fresh && cache && cache.expiresAt > now) {
    return cache.state;
  }
  let state: MaintenanceSetting | null;
  try {
    const raw = await kv.get(MAINTENANCE_KV_KEY, { cacheTtl: KV_CACHE_TTL_S });
    state = parseMaintenanceSetting(raw);
    if (raw !== null && state === null) {
      console.error(
        "[maintenance] Failed to parse the KV value; treating as off"
      );
    }
  } catch (error) {
    console.error("[maintenance] Failed to read the KV value:", error);
    state = cache?.state ?? null;
  }
  cache = { expiresAt: now + CACHE_MS, state };
  return state;
}

/** Seconds until `until` when it is in the future, else 600. */
export function retryAfterSeconds(
  state: MaintenanceSetting,
  now: number = Date.now()
): number {
  const until = state.until ? Date.parse(state.until) : Number.NaN;
  const seconds = Math.ceil((until - now) / 1000);
  return Number.isFinite(seconds) && seconds > 0
    ? seconds
    : DEFAULT_RETRY_AFTER_S;
}

/**
 * The paths maintenance never blocks: exact paths, or whole path segments
 * under a prefix. The URL is already normalised (`..` resolved) here.
 */
const EXEMPT_PATHS = new Set([
  "/api/health",
  BYPASS_PATH,
  "/sign-in",
  // It only forwards consented events; without it the sign-in page's
  // screen views would fail (and log) through the window.
  "/api/analytics",
]);
const EXEMPT_PREFIXES = ["/api/webhooks/", "/.well-known/"];

/**
 * `METHOD path`: the `/api/auth` routes an existing admin needs to sign in
 * during a window (`:provider` is one lowercase segment). They are served
 * by the sign-in-only Better Auth (`createAuth({ signInOnly })`), so none
 * of them creates a user or mails an address without an account. Social
 * sign-in is the web flow only (the app gets 503s anyway). Everything else
 * under `/api/auth` gets the JSON 503.
 */
export const AUTH_SIGN_IN_ROUTES = [
  "POST /api/auth/sign-in/email",
  "POST /api/auth/sign-in/social",
  "GET /api/auth/callback/:provider",
  "POST /api/auth/callback/:provider",
  "POST /api/auth/email-otp/send-verification-otp",
  "POST /api/auth/sign-in/email-otp",
  "POST /api/auth/sign-in/magic-link",
  "GET /api/auth/magic-link/verify",
  "GET /api/auth/passkey/generate-authenticate-options",
  "POST /api/auth/passkey/verify-authentication",
  "GET /api/auth/get-session",
  "POST /api/auth/get-session",
  "POST /api/auth/sign-out",
] as const;

const PROVIDER = /^[a-z0-9-]+$/;
const PROVIDER_PARAM = ":provider";

function matchesRoute(
  route: string,
  method: string,
  pathname: string
): boolean {
  const [routeMethod, routePath = ""] = route.split(" ");
  if (routeMethod !== method) {
    return false;
  }
  if (!routePath.endsWith(PROVIDER_PARAM)) {
    return routePath === pathname;
  }
  const prefix = routePath.slice(0, -PROVIDER_PARAM.length);
  return (
    pathname.startsWith(prefix) && PROVIDER.test(pathname.slice(prefix.length))
  );
}

function isAuthSignInRoute(method: string, pathname: string): boolean {
  return AUTH_SIGN_IN_ROUTES.some((route) =>
    matchesRoute(route, method, pathname)
  );
}

function isExemptPath(pathname: string): boolean {
  return (
    EXEMPT_PATHS.has(pathname) ||
    EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(PADDING, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const encoder = new TextEncoder();

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    [usage]
  );
}

/**
 * The bypass cookie value `<exp>.<hmac>`: HMAC-SHA-256 over
 * `<exp>|<bypassVersion>` with `BETTER_AUTH_SECRET`, `exp` in Unix
 * seconds, 12 h after `nowS`.
 */
export async function signBypassCookie(
  secret: string,
  bypassVersion: number,
  nowS: number
): Promise<string> {
  const exp = nowS + BYPASS_TTL_S;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    encoder.encode(`${exp}|${bypassVersion}`)
  );
  return `${exp}.${base64Url(signature)}`;
}

/**
 * A cookie value's expiry (Unix seconds) when it is unexpired and signed
 * for this version, else null.
 */
async function verifyBypassCookie(
  value: string | undefined,
  secret: string,
  bypassVersion: number,
  nowS: number
): Promise<number | null> {
  const [exp = "", signature = "", ...rest] = (value ?? "").split(".");
  if (
    rest.length > 0 ||
    !EXP_DIGITS.test(exp) ||
    !SIGNATURE.test(signature) ||
    Number(exp) <= nowS
  ) {
    return null;
  }
  // `verify` compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    fromBase64Url(signature),
    encoder.encode(`${exp}|${bypassVersion}`)
  );
  return valid ? Number(exp) : null;
}

export interface BypassStatus {
  active: boolean;
  /** ISO 8601, when active. */
  expiresAt?: string;
}

/**
 * Whether a bypass cookie value would get this browser past the gate:
 * signed for the current `bypassVersion` (read fresh from KV; nothing
 * stored = the first version) and unexpired, with its expiry. Whether
 * maintenance is on does not matter (a cookie can be fetched before a
 * window). The settings page's bypass card shows it (the cookie is
 * HttpOnly).
 */
export async function bypassCookieStatus(
  value: string | undefined
): Promise<BypassStatus> {
  if (!value) {
    return { active: false };
  }
  const { auth, kv } = siteEnv();
  const state = await readMaintenance(kv, { fresh: true });
  const exp = await verifyBypassCookie(
    value,
    auth.BETTER_AUTH_SECRET,
    state?.bypassVersion ?? BYPASS_VERSION_INITIAL,
    Math.floor(Date.now() / 1000)
  );
  return exp === null
    ? { active: false }
    : { active: true, expiresAt: new Date(exp * 1000).toISOString() };
}

/** `Secure` outside dev only: dev runs on http://localhost or a LAN address. */
export function bypassCookieHeader(
  value: string,
  environment: Environment
): string {
  const secure = environment === "dev" ? "" : " Secure;";
  return `${BYPASS_COOKIE}=${value}; Path=/; Max-Age=${BYPASS_TTL_S}; HttpOnly;${secure} SameSite=Lax`;
}

/** The gate's answer for an admin sign-in route during a window. */
export const SIGN_IN_ONLY = "sign-in-only";

/**
 * The 503 for this request while maintenance is on; `SIGN_IN_ONLY` for an
 * `AUTH_SIGN_IN_ROUTES` request then (serve it with the sign-in-only
 * auth); or null to let it through. It reads KV at most once per 30 s per
 * isolate, plus one fresh read for a request that carries a bypass cookie
 * while the cache says "on". The session is never read: the cookie is
 * checked by its signature. A valid cookie gets the whole site, all of
 * `/api/auth` included.
 */
export async function maintenanceGate(
  request: Request
): Promise<Response | typeof SIGN_IN_ONLY | null> {
  const { pathname } = new URL(request.url);
  if (isExemptPath(pathname)) {
    return null;
  }
  const { auth, kv } = siteEnv();
  const cached = await readMaintenance(kv);
  if (!cached?.enabled) {
    return null;
  }
  const cookie = parseCookie(request.headers.get("cookie") ?? "")[
    BYPASS_COOKIE
  ];
  const state = cookie ? await readMaintenance(kv, { fresh: true }) : cached;
  if (!state?.enabled) {
    return null;
  }
  const now = Date.now();
  const bypass =
    cookie !== undefined &&
    (await verifyBypassCookie(
      cookie,
      auth.BETTER_AUTH_SECRET,
      state.bypassVersion,
      Math.floor(now / 1000)
    )) !== null;
  if (bypass) {
    return null;
  }
  return isAuthSignInRoute(request.method, pathname)
    ? SIGN_IN_ONLY
    : maintenanceResponse(request, state, now);
}

function json(status: number, body: unknown, init: HeadersInit = {}): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store", ...init },
    status,
  });
}

/**
 * `POST /api/maintenance/bypass`: an admin session gets the 12 h bypass
 * cookie for the current `bypassVersion`, read fresh from KV. It also works
 * while maintenance is off, so it can be fetched just before a window.
 * Same-origin only (`isForeignRequest`, the rpc CSRF rule), then `RL_AUTH`
 * per IP, then the session (one D1 read). The admin settings page calls it
 * before it enables maintenance (so the acting admin keeps access) and from
 * its bypass card.
 */
export async function handleBypass(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { code: "METHOD_NOT_ALLOWED" }, { allow: "POST" });
  }
  const { auth, kv, rateLimits, vars, worker } = siteEnv();
  if (isForeignRequest(request, worker)) {
    return json(403, { code: "FORBIDDEN" });
  }
  if (!(await checkRateLimit(rateLimits.RL_AUTH, `mx:${clientIp(request)}`))) {
    return json(429, { code: "RATE_LIMITED" }, { "retry-after": "60" });
  }
  try {
    requireAdminUser(await getSession(getAuth(), request.headers));
  } catch (error) {
    if (error instanceof AuthError) {
      return json(error.code === "UNAUTHORIZED" ? 401 : 403, {
        code: error.code,
      });
    }
    console.error("[maintenance] Failed to check the admin session:", error);
    throw error;
  }
  const state = await readMaintenance(kv, { fresh: true });
  const nowS = Math.floor(Date.now() / 1000);
  const value = await signBypassCookie(
    auth.BETTER_AUTH_SECRET,
    state?.bypassVersion ?? BYPASS_VERSION_INITIAL,
    nowS
  );
  return json(
    200,
    { expiresAt: new Date((nowS + BYPASS_TTL_S) * 1000).toISOString() },
    { "set-cookie": bypassCookieHeader(value, vars.ENVIRONMENT) }
  );
}
