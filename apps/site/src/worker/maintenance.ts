import { AuthError, getSession, requireAdminUser } from "@smog/auth";
import type { Environment } from "@smog/config/env/worker";
import { checkRateLimit, isForeignRequest } from "@smog/rpc";
import { parseCookie } from "cookie-es";
import { getAuth, siteEnv } from "@/server/auth";
import { clientIp } from "@/server/context";
import { maintenanceResponse } from "./maintenance-page";

/**
 * Maintenance mode (spec §9). The KV key `maintenance` holds a
 * `MaintenanceState`; `bun run maintenance` writes it. While it is enabled,
 * the Worker answers every request with a 503, except:
 * - `/api/webhooks/*`, `/api/health` and `/.well-known/*`;
 * - `/api/auth/*` (it has its own `RL_AUTH` limit and captcha) and the
 *   `/sign-in` page, so an admin can sign in;
 * - `POST /api/maintenance/bypass`, where a signed-in admin gets the bypass
 *   cookie;
 * - requests with a valid bypass cookie.
 *
 * `bypassVersion` changes only when maintenance is turned off
 * (`bun run maintenance … off`), so a cookie fetched before or during a
 * window lasts for that window and dies with it. Cookies are signed and
 * checked against a fresh KV read, never the isolate cache.
 */

export const MAINTENANCE_KEY = "maintenance";
export const BYPASS_COOKIE = "smog_mx";
export const BYPASS_PATH = "/api/maintenance/bypass";

export interface MaintenanceState {
  /** A cookie is valid only for the version it was signed with. */
  bypassVersion: number;
  enabled: boolean;
  /** The operator's note, shown under the page text (plain text). */
  message?: string;
  /** ISO 8601: the expected end (the page and `Retry-After`). */
  until?: string;
}

/** The isolate cache; KV itself is read with its 30 s minimum `cacheTtl`. */
const CACHE_MS = 30_000;
const KV_CACHE_TTL_S = 30;
const DEFAULT_RETRY_AFTER_S = 600;
const BYPASS_TTL_S = 12 * 60 * 60;
const EXP_DIGITS = /^\d{1,12}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;
const PADDING = /[=]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The KV value, or null when it is missing or malformed (then: off). */
export function parseMaintenanceState(
  raw: string | null
): MaintenanceState | null {
  if (raw === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.bypassVersion !== "number" ||
    !Number.isSafeInteger(value.bypassVersion)
  ) {
    return null;
  }
  const { bypassVersion, enabled, message, until } = value;
  if (message !== undefined && typeof message !== "string") {
    return null;
  }
  if (
    until !== undefined &&
    (typeof until !== "string" || Number.isNaN(Date.parse(until)))
  ) {
    return null;
  }
  return {
    bypassVersion,
    enabled,
    ...(message === undefined ? {} : { message }),
    ...(until === undefined ? {} : { until }),
  };
}

let cache: { expiresAt: number; state: MaintenanceState | null } | undefined;

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
): Promise<MaintenanceState | null> {
  const now = Date.now();
  if (!fresh && cache && cache.expiresAt > now) {
    return cache.state;
  }
  let state: MaintenanceState | null;
  try {
    const raw = await kv.get(MAINTENANCE_KEY, { cacheTtl: KV_CACHE_TTL_S });
    state = parseMaintenanceState(raw);
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
  state: MaintenanceState,
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
const EXEMPT_PATHS = new Set(["/api/health", BYPASS_PATH, "/sign-in"]);
const EXEMPT_PREFIXES = ["/api/webhooks/", "/.well-known/", "/api/auth/"];

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

/** Whether a cookie value is unexpired and signed for this version. */
async function verifyBypassCookie(
  value: string | undefined,
  secret: string,
  bypassVersion: number,
  nowS: number
): Promise<boolean> {
  const [exp = "", signature = "", ...rest] = (value ?? "").split(".");
  if (
    rest.length > 0 ||
    !EXP_DIGITS.test(exp) ||
    !SIGNATURE.test(signature) ||
    Number(exp) <= nowS
  ) {
    return false;
  }
  // `verify` compares in constant time.
  return await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    fromBase64Url(signature),
    encoder.encode(`${exp}|${bypassVersion}`)
  );
}

/** `Secure` outside dev only: dev runs on http://localhost or a LAN address. */
export function bypassCookieHeader(
  value: string,
  environment: Environment
): string {
  const secure = environment === "dev" ? "" : " Secure;";
  return `${BYPASS_COOKIE}=${value}; Path=/; Max-Age=${BYPASS_TTL_S}; HttpOnly;${secure} SameSite=Lax`;
}

/**
 * The 503 for this request while maintenance is on, or null to let it
 * through. It reads KV at most once per 30 s per isolate, plus one fresh
 * read for a request that carries a bypass cookie while the cache says
 * "on". The session is never read: the cookie is checked by its signature.
 */
export async function maintenanceGate(
  request: Request
): Promise<Response | null> {
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
    ));
  return bypass ? null : maintenanceResponse(request, state, now);
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
 * per IP, then the session (one D1 read). Phase 5 calls it from the admin
 * settings; until then an admin signs in at `/sign-in` and runs
 * `fetch("/api/maintenance/bypass", { method: "POST" })` in the console.
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
    state?.bypassVersion ?? 0,
    nowS
  );
  return json(
    200,
    { expiresAt: new Date((nowS + BYPASS_TTL_S) * 1000).toISOString() },
    { "set-cookie": bypassCookieHeader(value, vars.ENVIRONMENT) }
  );
}
