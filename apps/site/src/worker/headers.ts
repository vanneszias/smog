import type { Environment } from "@smog/config/env/worker";

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
 * blob: worker). The OpenPanel relay is same-origin (`/api/analytics`).
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'sha256-${THEME_SCRIPT_HASH}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://image.mux.com",
    "media-src 'self' blob: https://stream.mux.com https://*.mux.com",
    "connect-src 'self' https://*.mux.com https://inferred.litix.io",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** A fresh CSP nonce: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export interface SecurityHeaderOptions {
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
  if (!(headers.has(CSP) || headers.has(CSP_REPORT_ONLY))) {
    headers.set(
      options.environment === "staging" ? CSP_REPORT_ONLY : CSP,
      buildCsp(options.nonce)
    );
  }
  return secured;
}
