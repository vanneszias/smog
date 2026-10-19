import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { CSP_REPORT_MAX_BYTES } from "../src/server/csp-report";
import { ORIGIN } from "./helpers";

/*
 * `POST /api/csp-report` through the Worker (phase 8 ruling 11). The
 * parser and the redaction are unit-tested in `src/server/csp-report.test.ts`;
 * this proves the route, the real `RL_ANALYTICS` binding (5 per minute in
 * the tests) and the log line.
 */

const TOKEN = "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9d";

function ip(): string {
  return `192.0.2.${Math.floor(Math.random() * 250) + 1}-${crypto.randomUUID()}`;
}

function report(
  address: string,
  body?: string,
  type?: string
): Promise<Response> {
  return exports.default.fetch(`${ORIGIN}/api/csp-report`, {
    body:
      body ??
      JSON.stringify({
        "csp-report": {
          "blocked-uri": "inline",
          disposition: "enforce",
          "document-uri": `${ORIGIN}/sponsor/edit?token=${TOKEN}#x`,
          "effective-directive": "script-src-elem",
          "line-number": 3,
          "script-sample": "secret",
          "source-file": `${ORIGIN}/sponsor/edit?token=${TOKEN}`,
        },
      }),
    headers: {
      "cf-connecting-ip": address,
      "content-type": type ?? "application/csp-report",
    },
    method: "POST",
  });
}

function violationLines(spy: MockInstance<typeof console.warn>): unknown[][] {
  return spy.mock.calls.filter(([message]) => message === "[csp] violation");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/csp-report", () => {
  it("logs one redacted line and answers an empty 204, with no Origin header", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await report(ip());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(violationLines(warn)).toEqual([
      [
        "[csp] violation",
        {
          blocked: "inline",
          count: 1,
          directive: "script-src-elem",
          disposition: "enforce",
          document: `${ORIGIN}/sponsor/edit`,
          line: 3,
          source: `${ORIGIN}/sponsor/edit`,
        },
      ],
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
  });

  it("takes the Reporting API format and ignores other report types", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await report(
      ip(),
      JSON.stringify([
        { body: {}, type: "deprecation", url: `${ORIGIN}/` },
        {
          body: {
            blockedURL: "https://evil.example/x.js?k=1",
            disposition: "enforce",
            documentURL: `${ORIGIN}/lists/${TOKEN}`,
            effectiveDirective: "script-src-elem",
          },
          type: "csp-violation",
          url: `${ORIGIN}/lists/${TOKEN}`,
        },
      ]),
      "application/reports+json"
    );
    expect(response.status).toBe(204);
    expect(violationLines(warn)).toEqual([
      [
        "[csp] violation",
        {
          blocked: "https://evil.example/x.js",
          count: 1,
          directive: "script-src-elem",
          disposition: "enforce",
          document: `${ORIGIN}/lists/:token`,
          line: null,
          source: null,
        },
      ],
    ]);
  });

  it("refuses another content type (415) and a body over 16 KiB (413)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const json = await report(ip(), "{}", "application/json");
    expect(json.status).toBe(415);
    expect(await json.text()).toBe("");
    const big = await report(ip(), "x".repeat(CSP_REPORT_MAX_BYTES + 1));
    expect(big.status).toBe(413);
    expect(await big.text()).toBe("");
    expect(violationLines(warn)).toEqual([]);
  });

  it("is rate-limited per IP on RL_ANALYTICS: 204 and silent over the limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const address = ip();
    for (let index = 0; index < 5; index += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one report at a time.
      const response = await report(address);
      expect(response.status).toBe(204);
    }
    expect(violationLines(warn)).toHaveLength(5);
    const over = await report(address);
    expect(over.status).toBe(204);
    expect(violationLines(warn)).toHaveLength(5);
    // Another IP has its own bucket.
    await report(ip());
    expect(violationLines(warn)).toHaveLength(6);
  });

  it("only handles POST (a GET is never a report)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await exports.default.fetch(`${ORIGIN}/api/csp-report`);
    expect(response.status).not.toBe(204);
    await response.body?.cancel();
    expect(violationLines(warn)).toEqual([]);
  });
});
