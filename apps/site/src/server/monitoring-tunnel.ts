import { readCappedBody } from "@smog/utils";

/**
 * `POST /api/monitoring`: the browser's error reports, forwarded to Rustrak
 * (docs/ERROR_MONITORING.md). The browser SDK sends its envelopes here
 * (`tunnel`), so the page's CSP stays `connect-src 'self'`, ad blockers do
 * not drop them and Rustrak never sees a visitor's IP address (the Worker
 * makes the request).
 *
 * - Without `SENTRY_DSN` monitoring is off: an empty 204, nothing read.
 * - Same-origin only (`isForeignRequest`): 403.
 * - `RL_ANALYTICS` per IP (`monitoring:<ip>`, no new binding): 429 with
 *   `Retry-After`, which the SDK honours.
 * - The body is capped at 256 KiB (`readCappedBody`): 413 past it.
 * - Only an envelope whose header names this env's own DSN is forwarded
 *   (another DSN is 403, no header 400), to that DSN's envelope endpoint,
 *   so the route cannot relay anywhere else. (The SDK's own
 *   `handleTunnelRequest` re-sends the body as a byte view, which reached
 *   Rustrak without a `Content-Length`: 411.)
 * - The answer carries Rustrak's status and its rate-limit headers, never
 *   its body. Nothing is logged: the body is the browser's report.
 */

export const MONITORING_TUNNEL_MAX_BYTES = 256 * 1024;

/** Upstream headers the SDK reads to back off; every other one is dropped. */
const RATE_LIMIT_HEADERS = ["retry-after", "x-sentry-rate-limits"];

export interface MonitoringTunnelOptions {
  /** This env's DSN (`SENTRY_DSN`); undefined: monitoring is off. */
  dsn: string | undefined;
  /** The upstream fetch (tests pass a fake). */
  forward?: typeof fetch;
  /** `isForeignRequest` with this env. */
  isForeign: (request: Request) => boolean;
  /** The `RL_ANALYTICS` check (`checkRateLimit`); `false` when over the limit. */
  limit: (key: string) => Promise<boolean>;
  /** Where a failed limit check goes (`console.error`). */
  logError?: (message: string, error: unknown) => void;
}

/** A DSN's parts: `<scheme>://<key>@<host>/<project>`. */
interface Dsn {
  host: string;
  key: string;
  project: string;
  protocol: string;
}

const DSN = /^(https?:)\/\/([^@/\s]+)@([^/\s]+)\/(\d+)$/;

function parseDsn(value: string): Dsn | null {
  const match = DSN.exec(value);
  if (!match) {
    return null;
  }
  const [, protocol = "", key = "", host = "", project = ""] = match;
  return { host, key, project, protocol };
}

/** The ingest URL of a DSN: its envelope endpoint, authenticated by query. */
function envelopeEndpoint(dsn: Dsn): string {
  return `${dsn.protocol}//${dsn.host}/api/${dsn.project}/envelope/?sentry_version=7&sentry_key=${encodeURIComponent(dsn.key)}`;
}

/** The DSN an envelope names in its header line, or null. */
export function envelopeDsn(bytes: Uint8Array): string | null {
  const newline = bytes.indexOf(10);
  const line = new TextDecoder().decode(
    newline === -1 ? bytes : bytes.subarray(0, newline)
  );
  try {
    const header: unknown = JSON.parse(line);
    const dsn = (header as { dsn?: unknown } | null)?.dsn;
    return typeof dsn === "string" ? dsn : null;
  } catch {
    return null;
  }
}

function empty(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    headers: { "cache-control": "no-store", ...headers },
    status,
  });
}

export async function handleMonitoringTunnel(
  request: Request,
  {
    dsn,
    isForeign,
    limit,
    forward = fetch,
    logError = console.error,
  }: MonitoringTunnelOptions
): Promise<Response> {
  if (!dsn) {
    return empty(204);
  }
  if (isForeign(request)) {
    return empty(403);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  try {
    if (!(await limit(`monitoring:${ip}`))) {
      return empty(429, { "retry-after": "60" });
    }
  } catch (error) {
    logError("[monitoring] Failed to check the rate limit:", error);
    return empty(429, { "retry-after": "60" });
  }
  const read = await readCappedBody(request, MONITORING_TUNNEL_MAX_BYTES);
  if (!read.ok) {
    return empty(read.status);
  }
  const named = envelopeDsn(read.bytes);
  if (named === null) {
    return empty(400);
  }
  const target = parseDsn(dsn);
  if (named !== dsn || target === null) {
    return empty(403);
  }
  let upstream: Response;
  try {
    upstream = await forward(envelopeEndpoint(target), {
      body: read.bytes,
      headers: {
        "content-length": String(read.bytes.byteLength),
        "content-type": "application/x-sentry-envelope",
      },
      method: "POST",
    });
  } catch (error) {
    logError("[monitoring] Failed to forward the envelope:", error);
    return empty(502);
  }
  const headers: Record<string, string> = {};
  for (const name of RATE_LIMIT_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      headers[name] = value;
    }
  }
  return empty(upstream.status, headers);
}
