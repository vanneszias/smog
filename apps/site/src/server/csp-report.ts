import { readCappedBody } from "@smog/utils";

/**
 * `POST /api/csp-report` (phase 8 ruling 11, carry 17): where browsers
 * send the site's CSP violations (`report-uri` and `report-to csp` in
 * `worker/headers.ts`). A public endpoint, so it gives nothing back and
 * keeps nothing it does not need:
 *
 * - Only `application/csp-report` (the `report-uri` body) and
 *   `application/reports+json` (the Reporting API; only `csp-violation`
 *   entries) are read; another type gets an empty 415.
 * - `RL_ANALYTICS` per IP (`csp:<ip>`, no new binding). Over the limit it
 *   answers 204 and neither reads nor logs the body.
 * - The body is capped at 16 KiB (`readCappedBody`): an empty 413 past it.
 * - Every other request gets an empty 204 (`no-store`): nothing is echoed,
 *   so a caller learns nothing, whatever it sent.
 * - One log line per body (a Reporting API batch included), its first
 *   violation and the count:
 *   `[csp] violation { directive, blocked, document, source, line, disposition, count }`.
 *   URLs keep only their origin and path, never the query or fragment
 *   (re-edit and renewal links carry raw tokens there), and path segments
 *   that carry a token (`/lists/<shareToken>`, a reset token, a minted
 *   token anywhere) become `:token`. The sample, the policy, the referrer
 *   and the user agent are never kept.
 * - No relay to OpenPanel (spec §12: consented events only).
 * - No Origin check: reporting agents send none (or `null`), and these
 *   content types need a CORS preflight the route never grants. The
 *   maintenance gate lets the path through (`worker/maintenance.ts`).
 */

export const CSP_REPORT_MAX_BYTES = 16 * 1024;

const MAX_URL_LENGTH = 256;
const MAX_INPUT_LENGTH = 4096;

const CONTENT_TYPES = new Set([
  "application/csp-report",
  "application/reports+json",
]);
type ReportContentType = "application/csp-report" | "application/reports+json";

/** `inline`, `eval`, `wasm-eval`, `trusted-types-sink` … */
const KEYWORD = /^[a-z][a-z-]{0,31}$/;
const DIRECTIVE = /^[a-z][a-z-]{0,39}$/;
const WHITESPACE = /\s+/;
const WEB_SCHEMES = new Set(["http:", "https:", "ws:", "wss:"]);
/** A segment that looks like a minted token (`newToken`: 43 base64url). */
const TOKEN_LIKE = /^[A-Za-z0-9_-]{20,}$/;
/** Slugs and UUIDs stay readable: lower case, digits and single hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** 32+ hex characters: a migrated share token (U-20) or a digest, never a slug. */
const HEX_TOKEN = /^[0-9a-f]{32,}$/i;
const REPEATED_SLASHES = /\/{2,}/g;
/** Paths whose next segment is a capability, whatever it looks like. */
const TOKEN_PREFIXES = [
  "/lists/",
  "/api/auth/reset-password/",
  "/api/logos/upload/",
];
const TOKEN_MARK = ":token";

export interface CspViolation {
  blocked: string | null;
  directive: string | null;
  disposition: "enforce" | "report" | null;
  document: string | null;
  line: number | null;
  source: string | null;
}

function isTokenSegment(segment: string): boolean {
  return (
    HEX_TOKEN.test(segment) || (TOKEN_LIKE.test(segment) && !SLUG.test(segment))
  );
}

/**
 * The path with its token segments masked. Repeated slashes are collapsed
 * and the prefixes compared case-insensitively first: the router matches
 * `/Lists/<token>` and `//lists/<token>` too.
 */
function redactPath(pathname: string): string {
  const path = pathname.replace(REPEATED_SLASHES, "/");
  const lower = path.toLowerCase();
  for (const prefix of TOKEN_PREFIXES) {
    if (lower.startsWith(prefix) && path.length > prefix.length) {
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf("/");
      return `${path.slice(0, prefix.length)}${TOKEN_MARK}${slash === -1 ? "" : redactPath(rest.slice(slash))}`;
    }
  }
  return path
    .split("/")
    .map((segment) => (isTokenSegment(segment) ? TOKEN_MARK : segment))
    .join("/");
}

/**
 * A URL from a report, safe to log: origin plus path (tokens masked), no
 * userinfo, query or fragment; a CSP keyword as is; another scheme's URL
 * as its scheme only (`data:`, `blob:<origin>`); anything else null.
 */
export function redactReportUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.length > MAX_INPUT_LENGTH
  ) {
    return null;
  }
  if (KEYWORD.test(value)) {
    return value;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!WEB_SCHEMES.has(url.protocol)) {
    if (url.protocol === "blob:" && url.origin !== "null") {
      return `blob:${url.origin}`;
    }
    return url.protocol;
  }
  return `${url.origin}${redactPath(url.pathname)}`.slice(0, MAX_URL_LENGTH);
}

function directiveOf(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const [name = ""] = value.trim().split(WHITESPACE);
  return DIRECTIVE.test(name) ? name : null;
}

function dispositionOf(value: unknown): CspViolation["disposition"] {
  return value === "enforce" || value === "report" ? value : null;
}

function lineOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `report-uri` body: `{ "csp-report": { "document-uri", … } }`. */
function fromLegacy(body: unknown): CspViolation[] {
  const report = isRecord(body) ? body["csp-report"] : undefined;
  if (!isRecord(report)) {
    return [];
  }
  return [
    {
      blocked: redactReportUrl(report["blocked-uri"]),
      directive: directiveOf(
        report["effective-directive"] ?? report["violated-directive"]
      ),
      disposition: dispositionOf(report.disposition),
      document: redactReportUrl(report["document-uri"]),
      line: lineOf(report["line-number"]),
      source: redactReportUrl(report["source-file"]),
    },
  ];
}

/** The Reporting API body: `[{ type: "csp-violation", url, body }, …]`. */
function fromReportingApi(body: unknown): CspViolation[] {
  if (!Array.isArray(body)) {
    return [];
  }
  const violations: CspViolation[] = [];
  for (const entry of body) {
    if (
      !isRecord(entry) ||
      entry.type !== "csp-violation" ||
      !isRecord(entry.body)
    ) {
      continue;
    }
    const report = entry.body;
    violations.push({
      blocked: redactReportUrl(report.blockedURL),
      directive: directiveOf(report.effectiveDirective),
      disposition: dispositionOf(report.disposition),
      document: redactReportUrl(report.documentURL ?? entry.url),
      line: lineOf(report.lineNumber),
      source: redactReportUrl(report.sourceFile),
    });
  }
  return violations;
}

/** The violations of a parsed body, redacted; non-CSP entries are dropped. */
export function parseCspReports(
  contentType: ReportContentType,
  body: unknown
): CspViolation[] {
  return contentType === "application/csp-report"
    ? fromLegacy(body)
    : fromReportingApi(body);
}

/** The one line per body: its first violation and how many it held. */
interface LoggedViolation extends CspViolation {
  count: number;
}

export interface CspReportOptions {
  /** The `RL_ANALYTICS` check (`checkRateLimit`); `false` when over the limit. */
  limit: (key: string) => Promise<boolean>;
  /** Where the body's one line goes (`console.warn`). */
  log?: (message: string, violation: LoggedViolation) => void;
  /** Where a failure goes (`console.error`). */
  logError?: (message: string, error: unknown) => void;
}

function empty(status: 204 | 400 | 413 | 415): Response {
  return new Response(null, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function reportContentType(request: Request): ReportContentType | null {
  const [type = ""] = (request.headers.get("content-type") ?? "").split(";");
  const normalized = type.trim().toLowerCase();
  return CONTENT_TYPES.has(normalized)
    ? (normalized as ReportContentType)
    : null;
}

export async function handleCspReport(
  request: Request,
  { limit, log = console.warn, logError = console.error }: CspReportOptions
): Promise<Response> {
  const contentType = reportContentType(request);
  if (contentType === null) {
    return empty(415);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  try {
    if (!(await limit(`csp:${ip}`))) {
      return empty(204);
    }
  } catch (error) {
    logError("[csp] Failed to check the rate limit:", error);
    return empty(204);
  }
  const read = await readCappedBody(request, CSP_REPORT_MAX_BYTES);
  if (!read.ok) {
    return empty(read.status);
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(read.bytes));
  } catch {
    return empty(204);
  }
  const [first, ...rest] = parseCspReports(contentType, body);
  if (first) {
    log("[csp] violation", { ...first, count: rest.length + 1 });
  }
  return empty(204);
}
