import { publicAuthConfig } from "@smog/config/env/worker";
import { createI18n, isLocale, type Locale, resolveLocale } from "@smog/i18n";
import { scriptJson } from "@/lib/head";
import { LOCALE_COOKIE } from "@/lib/preferences";
import { siteEnv } from "./auth";

/**
 * `/turnstile-bridge`: the Turnstile widget for the app (spec §12). The app
 * opens it in a WebView sheet when the server requires a captcha; the page
 * posts the token to `window.ReactNativeWebView` and nowhere else (no
 * `parent`/`opener` messages). In a normal browser it renders nothing but a
 * note, and it may not be framed. The CSP is this response's own, with a
 * per-response nonce, so the site-wide headers can change independently.
 */

/** Cloudflare's always-pass test site key (dev only, when none is set). */
const TEST_SITE_KEY = "1x00000000000000000000AA";

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=smogTurnstileLoaded";
const CHALLENGES = "https://challenges.cloudflare.com";

/**
 * The page's own script. It runs only inside the app's WebView (the bridge
 * object exists), loads the widget explicitly, and posts each outcome as
 * JSON: `{ source: "smog-turnstile", type: "token", token }`, or `type`
 * `error` / `expired` (read by `parseBridgeMessage` in the app).
 */
const BRIDGE_SCRIPT = `(function () {
  var config = JSON.parse(document.getElementById("config").textContent);
  var status = document.getElementById("status");
  var bridge = window.ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== "function") {
    status.textContent = config.appOnly;
    return;
  }
  function post(message) {
    message.source = "smog-turnstile";
    bridge.postMessage(JSON.stringify(message));
  }
  function failed() {
    status.textContent = config.failed;
    post({ type: "error" });
  }
  window.smogTurnstileLoaded = function () {
    window.turnstile.render("#widget", {
      callback: function (token) {
        status.textContent = "";
        post({ token: token, type: "token" });
      },
      "error-callback": failed,
      "expired-callback": function () {
        post({ type: "expired" });
      },
      language: config.language,
      sitekey: config.siteKey,
      theme: "auto"
    });
  };
  var script = document.createElement("script");
  script.async = true;
  script.nonce = config.nonce;
  script.onerror = failed;
  script.src = config.scriptUrl;
  document.head.appendChild(script);
})();`;

const STYLE = `:root{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif}
body{margin:0;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
#widget{min-height:65px}
p{margin:0;font-size:14px}`;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function bridgeCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${CHALLENGES}`,
    // Turnstile sizes its iframe with inline styles.
    "style-src 'unsafe-inline'",
    `frame-src ${CHALLENGES}`,
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

interface BridgePageOptions {
  locale: Locale;
  nonce: string;
  siteKey: string;
}

function bridgePage({ locale, nonce, siteKey }: BridgePageOptions): string {
  const { t } = createI18n(locale);
  const config = {
    appOnly: t("auth.captcha.appOnly"),
    failed: t("auth.captcha.failed"),
    language: locale,
    nonce,
    scriptUrl: SCRIPT_URL,
    siteKey,
  };
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(t("auth.captcha.label"))}</title>
<style>${STYLE}</style>
</head>
<body>
<div id="widget" aria-label="${escapeHtml(t("auth.captcha.label"))}"></div>
<p id="status" role="status"></p>
<script type="application/json" id="config">${scriptJson(config)}</script>
<script nonce="${nonce}">${BRIDGE_SCRIPT}</script>
</body>
</html>`;
}

function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      return value.join("=");
    }
  }
  return null;
}

/** The app's `?lang=`, else the locale cookie, else Accept-Language. */
function bridgeLocale(request: Request): Locale {
  const lang = new URL(request.url).searchParams.get("lang");
  if (isLocale(lang)) {
    return lang;
  }
  return resolveLocale({
    acceptLanguage: request.headers.get("accept-language"),
    cookie: cookieValue(request.headers.get("cookie"), LOCALE_COOKIE),
  });
}

export function turnstileBridge(request: Request): Response {
  try {
    const { vars, worker } = siteEnv();
    const configured = publicAuthConfig(worker).turnstileSiteKey;
    const siteKey =
      configured || (vars.ENVIRONMENT === "dev" ? TEST_SITE_KEY : null);
    const nonce = createNonce();
    const headers = {
      "cache-control": "no-store",
      "content-security-policy": bridgeCsp(nonce),
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "x-robots-tag": "noindex",
    };
    if (!siteKey) {
      // No key, no captcha on the server either: the app never opens this.
      return new Response("Turnstile is not configured", {
        headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
        status: 404,
      });
    }
    return new Response(
      bridgePage({ locale: bridgeLocale(request), nonce, siteKey }),
      { headers }
    );
  } catch (error) {
    console.error("[turnstile-bridge] Failed to render the bridge:", error);
    throw error;
  }
}
