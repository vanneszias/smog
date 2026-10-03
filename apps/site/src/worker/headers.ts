import { type Environment, MUX_DEFAULT_API_URL } from "@smog/config/env/worker";
import { r2Origin } from "@smog/sponsorships/server";

/**
 * The site's security headers (spec §9, the old Caddy set), added to every
 * response the Worker answers: Start's pages and API, the legacy 301s and
 * the maintenance 503. Static assets are served before the Worker runs and
 * get theirs from `public/_headers`.
 *
 * - Every response: `X-Content-Type-Options`, `Referrer-Policy` and, outside
 *   dev, `Strict-Transport-Security`.
 * - HTML and redirects also get the CSP, `X-Frame-Options`,
 *   `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
 * - A header the route already set wins: this never overwrites one. A route
 *   that sends its own `Content-Security-Policy` (or `-Report-Only`), like
 *   `/turnstile-bridge`, gets neither CSP header from here, so its policy is
 *   the only one the browser applies (two policies would both be enforced).
 */

/** The CSP `sha256-` source of the theme pre-paint script (build-defines.ts). */
export const THEME_SCRIPT_HASH: string = __SMOG_THEME_SCRIPT_HASH__;

const HSTS = "max-age=31536000; includeSubDomains";
const CSP = "content-security-policy";
const CSP_REPORT_ONLY = "content-security-policy-report-only";

const BASE_HEADERS: Readonly<Record<string, string>> = {
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
};

const DOCUMENT_HEADERS: Readonly<Record<string, string>> = {
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "x-frame-options": "DENY",
};

/**
 * The page CSP. Start's hydration and stream scripts are inline and change
 * per request, so they carry the request's nonce (`src/router.tsx`); the
 * theme pre-paint script is allowed by its hash. Turnstile loads from
 * challenges.cloudflare.com (script + frame); Mux Player is bundled and
 * fetches posters, storyboards and HLS from *.mux.com (hls.js runs in a
 * blob: worker). The admin video upload PUTs the file straight to the Mux
 * direct-upload URL, on a `*.mux.com` host since 2025 (`@smog/video`
 * `isAllowedUploadUrl` refuses any other), so `connect-src` already covers
 * it. Google profile pictures come from lh3.googleusercontent.com.
 * The OpenPanel relay is same-origin (`/api/analytics`). The site loads no
 * web fonts, so `font-src` is the brief's minus fonts.gstatic.com.
 * `connectSrc` adds sources to `connect-src` (dev: the Mux fake).
 */
export function buildCsp(
  nonce: string,
  { connectSrc = [] }: CspOptions = {}
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'sha256-${THEME_SCRIPT_HASH}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://image.mux.com https://lh3.googleusercontent.com",
    "media-src 'self' blob: https://stream.mux.com https://*.mux.com",
    [
      "connect-src 'self' https://*.mux.com https://inferred.litix.io",
      ...connectSrc,
    ].join(" "),
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export interface CspOptions {
  /** Extra `connect-src` sources (`devConnectSources`). */
  connectSrc?: readonly string[];
}

/**
 * The extra `connect-src` of a dev server whose `MUX_API_URL` points at the
 * Mux fake (the e2e): its origin, where the fake's upload URLs live. Never
 * outside dev, and nothing for the real Mux API.
 */
export function devConnectSources(
  environment: Environment,
  muxApiUrl: unknown
): string[] {
  if (environment !== "dev" || typeof muxApiUrl !== "string") {
    return [];
  }
  try {
    const { origin } = new URL(muxApiUrl);
    return origin === MUX_DEFAULT_API_URL || origin === "null" ? [] : [origin];
  } catch {
    return [];
  }
}

/** A Cloudflare account id: 32 lowercase hex characters. */
const R2_ACCOUNT_ID = /^[0-9a-f]{32}$/;

/**
 * The extra `connect-src` for the sponsor logo's presigned PUT (phase 6
 * ruling 10): the account's R2 S3 host, when `R2_ACCOUNT_ID` is set. Without
 * it the logo uses the same-origin fallback, which `'self'` covers.
 */
export function r2ConnectSources(accountId: unknown): string[] {
  return typeof accountId === "string" && R2_ACCOUNT_ID.test(accountId)
    ? [r2Origin(accountId)]
    : [];
}

/** A fresh CSP nonce: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export interface SecurityHeaderOptions {
  /** Extra `connect-src` sources (dev only: `devConnectSources`). */
  connectSrc?: readonly string[];
  environment: Environment;
  nonce: string;
}

function isDocument(response: Response): boolean {
  const redirect = response.status >= 300 && response.status < 400;
  const type = response.headers.get("content-type") ?? "";
  return redirect || type.startsWith("text/html");
}

function setMissing(
  headers: Headers,
  values: Readonly<Record<string, string>>
): void {
  for (const [name, value] of Object.entries(values)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
}

/**
 * The response with the security headers added. Production enforces the
 * CSP; staging sends it `Report-Only` (violations show in the console
 * without breaking the page); dev enforces it, so `bun dev` and the e2e
 * suite see exactly what production will block.
 */
export function withSecurityHeaders(
  response: Response,
  options: SecurityHeaderOptions
): Response {
  // A WebSocket upgrade cannot be re-wrapped.
  if (response.status === 101 || response.webSocket) {
    return response;
  }
  // Copy: a redirect's (or a fetched response's) headers are immutable.
  const secured = new Response(response.body, response);
  const { headers } = secured;
  setMissing(headers, BASE_HEADERS);
  if (options.environment !== "dev") {
    setMissing(headers, { "strict-transport-security": HSTS });
  }
  if (!isDocument(secured)) {
    return secured;
  }
  setMissing(headers, DOCUMENT_HEADERS);
  if (headers.get("content-type")?.startsWith("text/html")) {
    // The page carries this response's nonce: never let a shared cache
    // (a later Cache Rule, a proxy) serve it to someone else.
    setMissing(headers, { "cache-control": "private, no-cache" });
  }
  if (!(headers.has(CSP) || headers.has(CSP_REPORT_ONLY))) {
    headers.set(
      options.environment === "staging" ? CSP_REPORT_ONLY : CSP,
      buildCsp(options.nonce, {
        connectSrc: options.connectSrc ?? [],
      })
    );
  }
  return secured;
}

/**
 * The Worker's `fetch` body: one nonce for the handler and the CSP, and an
 * exception that escapes the handler becomes a plain 500 with the security
 * headers (Cloudflare's own error page would have none).
 */
export async function respondSecurely(
  environment: Environment,
  handle: (nonce: string) => Promise<Response> | Response,
  { connectSrc = [] }: CspOptions = {}
): Promise<Response> {
  const nonce = createNonce();
  let response: Response;
  try {
    response = await handle(nonce);
  } catch (error) {
    console.error("[site] Failed to handle the request:", error);
    response = new Response("Internal Server Error", {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      },
      status: 500,
    });
  }
  return withSecurityHeaders(response, { connectSrc, environment, nonce });
}
