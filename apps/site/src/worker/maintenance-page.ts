import type { MaintenanceSetting } from "@smog/admin/schema";
import { handSvgs, logoSvg } from "@smog/brand/svg";
import { createI18n, formatDate, type Locale, resolveLocale } from "@smog/i18n";
import { tokens } from "@smog/styles/tokens";
import { escapeHtml } from "@smog/utils";
import { parseCookie } from "cookie-es";
import {
  LOCALE_COOKIE,
  parseTheme,
  THEME_COOKIE,
  type Theme,
} from "@/lib/preferences";
import { retryAfterSeconds } from "./maintenance";

/**
 * The maintenance 503: one static HTML document with no script, no external
 * request and no asset of its own (the logo and hands are inline SVG), so it
 * renders whatever else is down. A port of the old `maintenance/index.html`
 * with the brand tokens, in nl/en/fr (the `locale` cookie, then
 * Accept-Language, as on the site) and in the `theme` cookie's theme.
 */

const { dark, light } = tokens.color;
const { radius } = tokens;
const FONT = tokens.fontFamily.web.join(", ");

function palette(colors: typeof light | typeof dark): string {
  return [
    `--background:${colors.background}`,
    `--surface:${colors.surfaceRaised}`,
    `--border:${colors.border}`,
    `--foreground:${colors.foreground}`,
    `--muted:${colors.foregroundMuted}`,
    `--primary:${colors.primary}`,
    `--primary-strong:${colors.primaryStrong}`,
    `--primary-foreground:${colors.primaryForeground}`,
    `--hands:${colors.primary}`,
  ].join(";");
}

const STYLES = `
:root{${palette(light)};color-scheme:light}
:root.dark{${palette(dark)};color-scheme:dark}
@media (prefers-color-scheme: dark){:root:not(.light){${palette(dark)};color-scheme:dark}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;padding:2rem 1rem;font-family:${FONT};color:var(--foreground);background:var(--background);-webkit-font-smoothing:antialiased}
main{width:100%;max-width:30rem;padding:3rem 2rem;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:${radius.xl}px;box-shadow:0 4px 24px rgb(0 0 0 / .06)}
.logo{color:var(--primary);margin:0 auto 2rem;width:12.5rem}
.logo svg{display:block;width:100%;height:auto}
.hands{display:flex;gap:2rem;justify-content:center;align-items:center;margin-bottom:2rem;color:var(--hands);opacity:.8}
.hands svg{width:3.5rem;height:auto}
.badge{display:inline-flex;gap:.5rem;align-items:center;padding:.375rem .875rem;margin-bottom:1.75rem;font-size:.75rem;font-weight:600;letter-spacing:.03em;color:var(--primary-foreground);background:var(--primary-strong);border-radius:${radius.full}px}
.dot{flex-shrink:0;width:7px;height:7px;background:currentColor;border-radius:50%;animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.dot{animation:none}}
h1{margin-bottom:.75rem;font-size:1.5rem;line-height:1.25;font-weight:700}
p{font-size:1rem;line-height:1.65;color:var(--muted)}
p+p{margin-top:1rem}
.note{color:var(--foreground)}
@media (min-width: 640px){main{padding:3rem 2.5rem}}
`
  .trim()
  .replaceAll("\n", "");

export interface MaintenancePageOptions {
  locale: Locale;
  now: number;
  state: MaintenanceSetting;
  theme: Theme;
}

export function renderMaintenancePage({
  locale,
  now,
  state,
  theme,
}: MaintenancePageOptions): string {
  const { t } = createI18n(locale);
  const until = state.until ? Date.parse(state.until) : Number.NaN;
  const untilHtml =
    until > now
      ? `<p>${escapeHtml(t("maintenance.until", { time: "\u0000" })).replace(
          "\u0000",
          `<time datetime="${escapeHtml(new Date(until).toISOString())}">${escapeHtml(
            formatDate(until, locale, { dateStyle: "long", timeStyle: "short" })
          )}</time>`
        )}</p>`
      : "";
  const noteHtml = state.message
    ? `<p class="note">${escapeHtml(state.message)}</p>`
    : "";
  const themeClass = theme === "system" ? "" : ` class="${theme}"`;
  return `<!doctype html>
<html lang="${locale}"${themeClass}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(t("maintenance.documentTitle"))}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
<div class="logo" role="img" aria-label="${escapeHtml(t("common.appName"))}">${logoSvg}</div>
<div class="hands" aria-hidden="true">${handSvgs[0]}${handSvgs[1]}</div>
<div class="badge"><span class="dot" aria-hidden="true"></span>${escapeHtml(t("maintenance.badge"))}</div>
<h1>${escapeHtml(t("maintenance.title"))}</h1>
<p>${escapeHtml(t("maintenance.description"))}</p>
${untilHtml}${noteHtml}
</main>
</body>
</html>
`;
}

/**
 * The 503 for a blocked request: the page for documents, a small JSON body
 * for `/api/*` (the apps and fetch callers). Never cached, with
 * `Retry-After`.
 */
export function maintenanceResponse(
  request: Request,
  state: MaintenanceSetting,
  now: number
): Response {
  const headers = {
    "cache-control": "no-store",
    "retry-after": String(retryAfterSeconds(state, now)),
  };
  const { pathname } = new URL(request.url);
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return Response.json(
      {
        code: "MAINTENANCE",
        ...(state.message ? { message: state.message } : {}),
        until: state.until ?? null,
      },
      { headers, status: 503 }
    );
  }
  const cookies = parseCookie(request.headers.get("cookie") ?? "");
  const locale = resolveLocale({
    acceptLanguage: request.headers.get("accept-language"),
    cookie: cookies[LOCALE_COOKIE] ?? null,
  });
  const html = renderMaintenancePage({
    locale,
    now,
    state,
    theme: parseTheme(cookies[THEME_COOKIE]),
  });
  return new Response(request.method === "HEAD" ? null : html, {
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    status: 503,
  });
}
