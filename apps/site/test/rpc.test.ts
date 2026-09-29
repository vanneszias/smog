import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

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
  it("answers POSTs over the limit with 429 RATE_LIMITED, per IP", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const post = () =>
      exports.default.fetch(`${ORIGIN}/api/auth/sign-in/email`, {
        body: JSON.stringify({ email: "nobody@smog.test", password: "x" }),
        headers: {
          "cf-connecting-ip": ip,
          "content-type": "application/json",
          origin: ORIGIN,
        },
        method: "POST",
      });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the limit counts requests in order.
      statuses.push((await post()).status);
    }

    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
    const limited = await post();
    expect(await limited.json()).toEqual({ code: "RATE_LIMITED" });

    const other = await exports.default.fetch(
      `${ORIGIN}/api/auth/get-session`,
      {
        headers: { "cf-connecting-ip": ip },
      }
    );
    expect(other.status).toBe(200);
  });
});
