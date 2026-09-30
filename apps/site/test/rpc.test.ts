import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { siteEnv } from "../src/server/auth";
import { createRpcContext } from "../src/server/context";
import { apiDocsEnabled } from "../src/server/dev-tools";

const ORIGIN = "http://localhost:5173";
const OPENAPI_3 = /^3\./;

describe("/api/rpc/*", () => {
  it("system.health returns ok: true", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/rpc/system/health`,
      {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST",
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      json: { environment: "dev", ok: true },
    });
  });

  it("system.whoami returns a null user for a guest", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/rpc/system/whoami`,
      {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST",
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: { user: null } });
  });

  it("answers an unknown procedure with 404", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/rpc/system/nope`,
      { body: "{}", method: "POST" }
    );
    expect(response.status).toBe(404);
  });
});

describe("/api/openapi/*", () => {
  it("serves an OpenAPI 3 document that contains /system/health", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/openapi/spec.json`
    );

    expect(response.status).toBe(200);
    const spec = (await response.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(spec.openapi).toMatch(OPENAPI_3);
    expect(spec.paths).toHaveProperty("/system/health");
  });

  it("serves the reference UI at /api/openapi", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/openapi`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("@scalar/api-reference");
    expect(html).toContain("system.health");
  });

  it("calls procedures over the OpenAPI transport", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/openapi/system/health`,
      { method: "POST" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ environment: "dev", ok: true });
  });
});

describe("RL_AUTH on /api/auth/*", () => {
  // IPs no other test uses, so no earlier request shares their bucket.
  const IPS = ["198.51.100.23", "198.51.100.25"] as const;
  /** Miniflare's limiter counts in wall-clock windows of the period (60 s). */
  const WINDOW_MS = 60_000;

  function postAuth(
    ip: string,
    path: string,
    body: unknown = {}
  ): Promise<Response> {
    return exports.default.fetch(`${ORIGIN}/api/auth${path}`, {
      body: JSON.stringify(body),
      headers: {
        "cf-connecting-ip": ip,
        "content-type": "application/json",
        origin: ORIGIN,
      },
      method: "POST",
    });
  }

  it("answers POSTs over the limit with 429 RATE_LIMITED, per IP", async () => {
    const credentials = { email: "nobody@smog.test", password: "x" };
    /**
     * Seven sign-ins from `from`: their statuses and the last body, or
     * `null` when they straddled a limiter window.
     */
    async function seven(
      from: string
    ): Promise<{ last: unknown; statuses: number[] } | null> {
      const started = Math.floor(Date.now() / WINDOW_MS);
      const statuses: number[] = [];
      let last: unknown;
      for (let attempt = 0; attempt < 7; attempt += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: the limit counts requests in order.
        const response = await postAuth(from, "/sign-in/email", credentials);
        statuses.push(response.status);
        last = await response.json();
      }
      return Math.floor(Date.now() / WINDOW_MS) === started
        ? { last, statuses }
        : null;
    }
    // Each sign-in hashes a password: under load seven can cross a minute
    // boundary, where the count starts again. Then retry once, on a fresh IP.
    const [first, second] = IPS;
    let ip: string = first;
    let run = await seven(ip);
    if (run === null) {
      ip = second;
      run = await seven(ip);
    }

    expect(run).not.toBeNull();
    expect(run?.statuses.slice(0, 5)).not.toContain(429);
    expect(run?.statuses.slice(5)).toEqual([429, 429]);
    expect(run?.last).toEqual({ code: "RATE_LIMITED" });

    // Session reads and sign-out stay available to the same IP.
    const session = await exports.default.fetch(
      `${ORIGIN}/api/auth/get-session`,
      { headers: { "cf-connecting-ip": ip } }
    );
    expect(session.status).toBe(200);
    expect((await postAuth(ip, "/sign-out")).status).not.toBe(429);

    // Another IP has its own bucket.
    const other = await exports.default.fetch(
      `${ORIGIN}/api/auth/sign-in/email`,
      {
        body: JSON.stringify(credentials),
        headers: {
          "cf-connecting-ip": "198.51.100.24",
          "content-type": "application/json",
          origin: ORIGIN,
        },
        method: "POST",
      }
    );
    expect(other.status).not.toBe(429);
  });
});

describe("apiDocsEnabled", () => {
  it("is on in dev and staging, off in production", () => {
    expect(apiDocsEnabled("dev")).toBe(true);
    expect(apiDocsEnabled("staging")).toBe(true);
    expect(apiDocsEnabled("production")).toBe(false);
  });
});

describe("createRpcContext", () => {
  const ctx = { waitUntil: () => undefined };

  it("reads ip, locale cookie and Accept-Language without any session I/O", () => {
    const context = createRpcContext(
      new Request(`${ORIGIN}/api/rpc/system/health`, {
        headers: {
          "accept-language": "en-GB,en;q=0.9",
          "cf-connecting-ip": "203.0.113.5",
          cookie: "theme=dark; locale=fr",
        },
      }),
      siteEnv(),
      ctx
    );

    expect(context.ip).toBe("203.0.113.5");
    expect(context.locale).toBe("fr");
    expect(context.session).toBeNull();
    expect(context.env.ENVIRONMENT).toBe("dev");
  });

  it("falls back to Accept-Language, nl and the unknown IP", () => {
    const english = createRpcContext(
      new Request(ORIGIN, { headers: { "accept-language": "en-GB" } }),
      siteEnv(),
      ctx
    );
    expect(english.locale).toBe("en");
    expect(english.ip).toBe("unknown");

    const bare = createRpcContext(new Request(ORIGIN), siteEnv(), ctx);
    expect(bare.locale).toBe("nl");
  });
});
