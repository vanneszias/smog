/**
 * The OpenAPI reference UI (`/api/openapi`, dev and staging only): Scalar's
 * standalone bundle from jsDelivr, pinned to one version and checked with
 * its SRI hash, and a small same-origin script that mounts it on the spec.
 * The page has no inline script, and its CSP (its own, which the site-wide
 * headers keep) allows `'self'` and exactly that bundle URL.
 *
 * The bundle is 4.3 MB, so it is not served from our assets. To upgrade:
 * change the version, then set the integrity to
 * `sha384-` + base64(sha384(dist/browser/standalone.js)) of that npm tarball
 * (`npm pack @scalar/api-reference@<version>`; jsDelivr serves the npm file
 * byte for byte).
 */

import { escapeHtml } from "@smog/utils";

const SCALAR_VERSION = "1.72.2";
export const SCALAR_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js`;
export const SCALAR_SCRIPT_INTEGRITY =
  "sha384-mc6GgHVwdYe1ZSU5XmJBa2pe6QzCRDSd0Pk8TqiqM7iiAOFMKtpBTOOa2RZDHkYN";

/** Our scripts, served next to the page: before and after the bundle. */
export const OPENAPI_PRELUDE_SCRIPT = "/api/openapi/prelude.js";
export const OPENAPI_REFERENCE_SCRIPT = "/api/openapi/reference.js";
const SPEC_PATH = "/api/openapi/spec.json";

/**
 * Before the bundle: Scalar's bundled Zod probes `Function("")` for its JIT
 * (a CSP `eval` violation); jitless skips the probe, as the site's own
 * Zod does (`lib/zod-jitless.ts`). Zod reads this global when it loads.
 */
const PRELUDE =
  "globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, { jitless: true });\n";

/**
 * Scalar's configuration: the spec by URL (same origin), and nothing that
 * reaches a third party (no default web fonts, no telemetry).
 */
const REFERENCE_CONFIG = {
  telemetry: false,
  url: SPEC_PATH,
  withDefaultFonts: false,
};

/**
 * The page's own CSP. Scalar injects its styles at runtime (inline
 * `<style>`), and draws some icons and the logo as `data:` images.
 */
function openApiReferenceCsp(): string {
  return [
    "default-src 'none'",
    `script-src 'self' ${SCALAR_SCRIPT_URL}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function renderReferenceHtml(title: string): string {
  const escaped = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escaped}</title>
</head>
<body>
<div id="app"></div>
<script src="${OPENAPI_PRELUDE_SCRIPT}"></script>
<script src="${SCALAR_SCRIPT_URL}" integrity="${SCALAR_SCRIPT_INTEGRITY}" crossorigin="anonymous"></script>
<script src="${OPENAPI_REFERENCE_SCRIPT}"></script>
</body>
</html>
`;
}

const SCRIPTS: Readonly<Record<string, string>> = {
  [OPENAPI_PRELUDE_SCRIPT]: PRELUDE,
  // Mounts Scalar on `#app`.
  [OPENAPI_REFERENCE_SCRIPT]: `Scalar.createApiReference("#app", ${JSON.stringify(REFERENCE_CONFIG)});\n`,
};

/** The page's own script at `pathname`, or null. */
export function referenceScriptResponse(pathname: string): Response | null {
  const script = SCRIPTS[pathname];
  if (script === undefined) {
    return null;
  }
  return new Response(script, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/javascript; charset=utf-8",
    },
  });
}

/** The reference page's response headers (the CSP is the page's own). */
export function referenceHeaders(): Record<string, string> {
  return {
    "cache-control": "no-store",
    "content-security-policy": openApiReferenceCsp(),
    "x-robots-tag": "noindex",
  };
}
