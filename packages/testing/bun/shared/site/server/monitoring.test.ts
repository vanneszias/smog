import { describe, expect, mock, test } from "bun:test";
import { shouldReport } from "../../../../../../apps/site/src/lib/monitoring";
import {
  envelopeDsn,
  handleMonitoringTunnel,
  MONITORING_TUNNEL_MAX_BYTES,
  type MonitoringTunnelOptions,
} from "../../../../../../apps/site/src/server/monitoring-tunnel";

const DSN = "https://0123456789abcdef0123456789abcdef@errors.example/2";
const OTHER = "https://fedcba9876543210fedcba9876543210@evil.example/9";

function envelope(dsn: string | null): string {
  const header = dsn ? { dsn, event_id: "e1" } : { event_id: "e1" };
  return `${JSON.stringify(header)}\n{"type":"event"}\n{"message":"x"}\n`;
}

function post(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request("https://smog.example/api/monitoring", {
    body,
    headers: { "cf-connecting-ip": "203.0.113.7", ...headers },
    method: "POST",
  });
}

function options(
  overrides: Partial<MonitoringTunnelOptions> = {}
): MonitoringTunnelOptions & { forward: ReturnType<typeof mock> } {
  const forward = mock(
    async () =>
      new Response("{}", {
        headers: { "retry-after": "5", "x-internal": "no" },
        status: 200,
      })
  );
  return {
    dsn: DSN,
    forward: forward as unknown as typeof fetch & ReturnType<typeof mock>,
    isForeign: () => false,
    limit: async () => true,
    logError: () => undefined,
    ...overrides,
  } as MonitoringTunnelOptions & { forward: ReturnType<typeof mock> };
}

describe("handleMonitoringTunnel", () => {
  test("forwards an envelope for this env's DSN to its endpoint", async () => {
    const opts = options();
    const response = await handleMonitoringTunnel(post(envelope(DSN)), opts);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("x-internal")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, init] = opts.forward.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://errors.example/api/2/envelope/?sentry_version=7&sentry_key=0123456789abcdef0123456789abcdef"
    );
    const headers = init.headers as Record<string, string>;
    expect(Number(headers["content-length"])).toBe(envelope(DSN).length);
    // No visitor data travels with it: no IP, no cookie.
    expect(Object.keys(headers).sort()).toEqual([
      "content-length",
      "content-type",
    ]);
  });

  test("is off without a DSN", async () => {
    const opts = options({ dsn: undefined });
    const response = await handleMonitoringTunnel(post(envelope(DSN)), opts);
    expect(response.status).toBe(204);
    expect(opts.forward).not.toHaveBeenCalled();
  });

  test("refuses another DSN, a missing header and a foreign origin", async () => {
    const opts = options();
    expect(
      (await handleMonitoringTunnel(post(envelope(OTHER)), opts)).status
    ).toBe(403);
    expect(
      (await handleMonitoringTunnel(post(envelope(null)), opts)).status
    ).toBe(400);
    expect(
      (
        await handleMonitoringTunnel(
          post(envelope(DSN)),
          options({ isForeign: () => true })
        )
      ).status
    ).toBe(403);
    expect(opts.forward).not.toHaveBeenCalled();
  });

  test("rate-limits per IP and caps the body", async () => {
    const keys: string[] = [];
    const limited = await handleMonitoringTunnel(
      post(envelope(DSN)),
      options({
        limit: (key) => {
          keys.push(key);
          return Promise.resolve(false);
        },
      })
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(keys).toEqual(["monitoring:203.0.113.7"]);
    const big = "x".repeat(MONITORING_TUNNEL_MAX_BYTES + 1);
    expect((await handleMonitoringTunnel(post(big), options())).status).toBe(
      413
    );
  });

  test("answers 502 when Rustrak cannot be reached", async () => {
    const response = await handleMonitoringTunnel(
      post(envelope(DSN)),
      options({
        forward: (() =>
          Promise.reject(new Error("down"))) as unknown as typeof fetch,
      })
    );
    expect(response.status).toBe(502);
  });
});

describe("envelopeDsn", () => {
  test("reads the header line only", () => {
    expect(envelopeDsn(new TextEncoder().encode(envelope(DSN)))).toBe(DSN);
    expect(envelopeDsn(new TextEncoder().encode("not json"))).toBeNull();
  });
});

describe("shouldReport (browser)", () => {
  test("reports errors, not expected API answers or non-errors", () => {
    expect(shouldReport(new Error("boom"))).toBe(true);
    const notFound = Object.assign(new Error("NOT_FOUND"), { status: 404 });
    expect(shouldReport(notFound)).toBe(false);
    const internal = Object.assign(new Error("INTERNAL"), { status: 500 });
    expect(shouldReport(internal)).toBe(true);
    expect(shouldReport({ isNotFound: true })).toBe(false);
    expect(shouldReport("text")).toBe(false);
  });
});
