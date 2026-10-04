import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  CSP_REPORT_MAX_BYTES,
  type CspReportOptions,
  handleCspReport,
  parseCspReports,
  redactReportUrl,
} from "./csp-report";

const TOKEN = "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9d";

function post(
  body: BodyInit | null,
  headers: Record<string, string> = {}
): Request {
  return new Request("https://smog.example/api/csp-report", {
    body,
    headers: { "content-type": "application/csp-report", ...headers },
    method: "POST",
  });
}

/** The legacy `report-uri` body (`application/csp-report`). */
function legacyReport(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    "csp-report": {
      "blocked-uri": "inline",
      disposition: "enforce",
      "document-uri": `https://smog.example/sponsor/edit?token=${TOKEN}#x`,
      "effective-directive": "script-src-elem",
      "line-number": 12,
      "original-policy": "default-src 'self'",
      referrer: "https://elsewhere.example/?q=secret",
      "script-sample": "alert('my secret')",
      "source-file": `https://smog.example/assets/main.js?v=${TOKEN}`,
      "status-code": 200,
      "violated-directive": "script-src-elem",
      ...fields,
    },
  });
}

/** The Reporting API body (`application/reports+json`). */
function reportsJson(entries: unknown[]): string {
  return JSON.stringify(entries);
}

function cspEntry(body: Record<string, unknown> = {}): unknown {
  return {
    age: 10,
    body: {
      blockedURL: "https://evil.example/x.js?k=v",
      columnNumber: 4,
      disposition: "report",
      documentURL: `https://smog.example/lists/${TOKEN}?a=b`,
      effectiveDirective: "script-src-elem",
      lineNumber: 7,
      originalPolicy: "default-src 'self'",
      referrer: "",
      sample: "secret sample",
      sourceFile: "https://smog.example/assets/app.js",
      statusCode: 200,
      ...body,
    },
    type: "csp-violation",
    url: `https://smog.example/lists/${TOKEN}?a=b`,
    user_agent: "Mozilla/5.0",
  };
}

interface Harness {
  limited: string[];
  logged: unknown[][];
  options: CspReportOptions;
}

function harness({ allow = true }: { allow?: boolean } = {}): Harness {
  const limited: string[] = [];
  const logged: unknown[][] = [];
  return {
    limited,
    logged,
    options: {
      limit: (key) => {
        limited.push(key);
        return Promise.resolve(allow);
      },
      log: (...args) => {
        logged.push(args);
      },
    },
  };
}

afterEach(() => {
  mock.restore();
});

describe("redactReportUrl", () => {
  test("keeps the origin and path, never the query or the fragment", () => {
    expect(
      redactReportUrl("https://smog.example/sponsor/edit?token=abc#x")
    ).toBe("https://smog.example/sponsor/edit");
    expect(
      redactReportUrl("https://smog.example/sponsor/renew?token=abc")
    ).toBe("https://smog.example/sponsor/renew");
    expect(redactReportUrl("https://a.example:8443/p#frag")).toBe(
      "https://a.example:8443/p"
    );
  });

  test("drops credentials in the URL", () => {
    expect(redactReportUrl("https://user:pass@a.example/p?x")).toBe(
      "https://a.example/p"
    );
  });

  test("masks the path segments that carry a token", () => {
    expect(redactReportUrl(`https://smog.example/lists/${TOKEN}`)).toBe(
      "https://smog.example/lists/:token"
    );
    expect(redactReportUrl("https://smog.example/lists/old-convex-token")).toBe(
      "https://smog.example/lists/:token"
    );
    expect(redactReportUrl("https://smog.example/lists")).toBe(
      "https://smog.example/lists"
    );
    expect(
      redactReportUrl("https://smog.example/api/auth/reset-password/tok123")
    ).toBe("https://smog.example/api/auth/reset-password/:token");
    expect(
      redactReportUrl("https://smog.example/api/logos/upload/logos%2Fabc")
    ).toBe("https://smog.example/api/logos/upload/:token");
    // Anything that looks like a minted token, on any origin.
    expect(redactReportUrl(`https://cdn.example/a/${TOKEN}/b.js`)).toBe(
      "https://cdn.example/a/:token/b.js"
    );
    // Slugs and UUIDs stay readable.
    expect(redactReportUrl("https://smog.example/gestures/goedemorgen")).toBe(
      "https://smog.example/gestures/goedemorgen"
    );
    expect(
      redactReportUrl(
        "https://smog.example/admin/gestures/0f5e7c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b"
      )
    ).toBe(
      "https://smog.example/admin/gestures/0f5e7c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b"
    );
  });

  test("masks list tokens in case-variant and double-slash paths (review M-1)", () => {
    const hex = "0123456789abcdef0123456789abcdef";
    expect(redactReportUrl("https://smog.example/LISTS/legacy-token-1")).toBe(
      "https://smog.example/LISTS/:token"
    );
    expect(redactReportUrl(`https://smog.example/Lists/${hex}`)).toBe(
      "https://smog.example/Lists/:token"
    );
    expect(redactReportUrl("https://smog.example//lists/legacytok")).toBe(
      "https://smog.example/lists/:token"
    );
    expect(
      redactReportUrl("https://smog.example///api//auth/Reset-Password/t")
    ).toBe("https://smog.example/api/auth/Reset-Password/:token");
    // A 32+ hex segment is a token anywhere (a migrated share token is 32
    // lower-case hex, which the slug rule would keep).
    expect(redactReportUrl(`https://smog.example/x/${hex}`)).toBe(
      "https://smog.example/x/:token"
    );
    expect(redactReportUrl(`https://smog.example/x/${hex}abcdef0123`)).toBe(
      "https://smog.example/x/:token"
    );
  });

  test("keeps the CSP keywords and only the scheme of other URLs", () => {
    expect(redactReportUrl("inline")).toBe("inline");
    expect(redactReportUrl("eval")).toBe("eval");
    expect(redactReportUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe("data:");
    expect(
      redactReportUrl("blob:https://smog.example/0f5e7c1a-2b3d-4e5f")
    ).toBe("blob:https://smog.example");
    expect(redactReportUrl("chrome-extension://abcdef/script.js")).toBe(
      "chrome-extension:"
    );
  });

  test("answers null for anything else", () => {
    for (const value of [
      undefined,
      null,
      42,
      "",
      "not a url with spaces",
      "x".repeat(5000),
    ]) {
      expect(redactReportUrl(value)).toBeNull();
    }
  });

  test("caps the length", () => {
    const long = `https://smog.example/${"a/".repeat(400)}`;
    expect(redactReportUrl(long)?.length).toBeLessThanOrEqual(256);
  });
});

describe("parseCspReports", () => {
  test("reads the legacy report-uri body", () => {
    expect(
      parseCspReports("application/csp-report", JSON.parse(legacyReport()))
    ).toEqual([
      {
        blocked: "inline",
        directive: "script-src-elem",
        disposition: "enforce",
        document: "https://smog.example/sponsor/edit",
        line: 12,
        source: "https://smog.example/assets/main.js",
      },
    ]);
  });

  test("falls back to violated-directive's name (CSP 2 browsers)", () => {
    const [violation] = parseCspReports(
      "application/csp-report",
      JSON.parse(
        legacyReport({
          "effective-directive": undefined,
          "violated-directive": "img-src 'self' data:",
        })
      )
    );
    expect(violation?.directive).toBe("img-src");
  });

  test("reads csp-violation entries of a Reporting API body, ignoring the rest", () => {
    const violations = parseCspReports("application/reports+json", [
      { body: { id: "x" }, type: "deprecation", url: "https://a.example/" },
      cspEntry(),
      { type: "intervention" },
      "junk",
    ]);
    expect(violations).toEqual([
      {
        blocked: "https://evil.example/x.js",
        directive: "script-src-elem",
        disposition: "report",
        document: "https://smog.example/lists/:token",
        line: 7,
        source: "https://smog.example/assets/app.js",
      },
    ]);
  });

  test("drops unknown values instead of passing them on", () => {
    const [violation] = parseCspReports("application/reports+json", [
      cspEntry({
        disposition: "<script>",
        effectiveDirective: "script-src 'unsafe-inline' \n injected",
        lineNumber: "12; DROP",
      }),
    ]);
    expect(violation).toMatchObject({
      directive: "script-src",
      disposition: null,
      line: null,
    });
  });

  test("never carries the sample, the policy, the referrer or the user agent", () => {
    const text = JSON.stringify([
      ...parseCspReports("application/csp-report", JSON.parse(legacyReport())),
      ...parseCspReports("application/reports+json", [cspEntry()]),
    ]);
    for (const secret of [
      "secret",
      "Mozilla",
      "default-src",
      "elsewhere",
      TOKEN,
      "?",
      "#",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  test("answers nothing for a body of the wrong shape", () => {
    expect(parseCspReports("application/csp-report", [])).toEqual([]);
    expect(parseCspReports("application/csp-report", { x: 1 })).toEqual([]);
    expect(parseCspReports("application/reports+json", {})).toEqual([]);
    expect(parseCspReports("application/reports+json", null)).toEqual([]);
  });

  test("reads every CSP entry of a batch (the handler logs one line)", () => {
    const entries = Array.from({ length: 50 }, () => cspEntry());
    expect(parseCspReports("application/reports+json", entries)).toHaveLength(
      50
    );
  });
});

describe("handleCspReport", () => {
  test("logs one redacted line and answers an empty 204", async () => {
    const { logged, limited, options } = harness();
    const response = await handleCspReport(
      post(legacyReport(), { "cf-connecting-ip": "198.51.100.7" }),
      options
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(limited).toEqual(["csp:198.51.100.7"]);
    expect(logged).toEqual([
      [
        "[csp] violation",
        {
          blocked: "inline",
          count: 1,
          directive: "script-src-elem",
          disposition: "enforce",
          document: "https://smog.example/sponsor/edit",
          line: 12,
          source: "https://smog.example/assets/main.js",
        },
      ],
    ]);
    expect(JSON.stringify(logged)).not.toContain("token");
  });

  test("takes the Reporting API format, with a charset parameter", async () => {
    const { logged, options } = harness();
    const response = await handleCspReport(
      post(reportsJson([cspEntry(), { type: "deprecation" }]), {
        "content-type": "application/reports+json; charset=utf-8",
      }),
      options
    );
    expect(response.status).toBe(204);
    expect(logged).toHaveLength(1);
    expect(logged[0]?.[1]).toMatchObject({
      count: 1,
      document: "https://smog.example/lists/:token",
    });
  });

  test("logs one line per body, the first violation with the count (review M-2)", async () => {
    const { logged, options } = harness();
    const entries = [
      { type: "deprecation" },
      cspEntry({ effectiveDirective: "img-src" }),
      ...Array.from({ length: 19 }, () => cspEntry()),
    ];
    const response = await handleCspReport(
      post(reportsJson(entries), {
        "content-type": "application/reports+json",
      }),
      options
    );
    expect(response.status).toBe(204);
    expect(logged).toHaveLength(1);
    expect(logged[0]?.[1]).toMatchObject({ count: 20, directive: "img-src" });
  });

  test("answers 204 and logs nothing for a body without CSP entries", async () => {
    const { logged, options } = harness();
    for (const body of [
      reportsJson([{ type: "deprecation" }]),
      "{not json",
      "",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one request at a time.
      const response = await handleCspReport(
        post(body, { "content-type": "application/reports+json" }),
        options
      );
      expect(response.status).toBe(204);
    }
    expect(logged).toEqual([]);
  });

  test("refuses another content type with an empty 415, before the rate limit", async () => {
    const { logged, limited, options } = harness();
    for (const type of [
      "application/json",
      "text/plain",
      "application/csp-report-x",
      "",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one request at a time.
      const response = await handleCspReport(
        post(legacyReport(), { "content-type": type }),
        options
      );
      expect(response.status, type).toBe(415);
      expect(await response.text()).toBe("");
    }
    expect(limited).toEqual([]);
    expect(logged).toEqual([]);
  });

  test("refuses a body over 16 KiB with an empty 413, declared or streamed", async () => {
    const { logged, options } = harness();
    const big = legacyReport({
      "script-sample": "x".repeat(CSP_REPORT_MAX_BYTES),
    });
    const declared = await handleCspReport(post(big), options);
    expect(declared.status).toBe(413);
    expect(await declared.text()).toBe("");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const streamed = await handleCspReport(
      new Request("https://smog.example/api/csp-report", {
        body: stream,
        // @ts-expect-error: `duplex` is required for a streamed body in Bun.
        duplex: "half",
        headers: { "content-type": "application/csp-report" },
        method: "POST",
      }),
      options
    );
    expect(streamed.status).toBe(413);
    expect(logged).toEqual([]);
  });

  test("over the rate limit: 204, nothing logged, the body never read", async () => {
    const { logged, limited, options } = harness({ allow: false });
    const request = post(legacyReport());
    const response = await handleCspReport(request, options);
    expect(response.status).toBe(204);
    expect(limited).toEqual(["csp:unknown"]);
    expect(logged).toEqual([]);
    expect(request.bodyUsed).toBe(false);
  });

  test("a failing rate limiter: 204, logs that failure only", async () => {
    const error = mock((_message: string, _error: unknown) => undefined);
    const { logged, options } = harness();
    const response = await handleCspReport(post(legacyReport()), {
      ...options,
      limit: () => Promise.reject(new Error("binding down")),
      logError: error,
    });
    expect(response.status).toBe(204);
    expect(logged).toEqual([]);
    expect(error).toHaveBeenCalledWith(
      "[csp] Failed to check the rate limit:",
      expect.any(Error)
    );
  });
});
