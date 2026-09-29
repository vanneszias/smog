import { RPCHandler } from "@orpc/server/fetch";
import type { Auth } from "@smog/auth";
import { describe, expect, it, vi } from "vitest";
import {
  isForeignRequest,
  publicProcedure,
  type RateLimiter,
  type RpcContext,
  type RpcEnv,
  rpcHandlerOptions,
} from "../src/index";
import { makeRpcContext, makeSession } from "../src/testing";

const SITE = "https://smog.vlaanderen";

function request(headers: Record<string, string>, method = "POST"): Request {
  return new Request(`${SITE}/api/rpc/me`, {
    body: method === "GET" ? null : JSON.stringify({ json: null }),
    headers: { "content-type": "application/json", ...headers },
    method,
  });
}

const PRODUCTION: Pick<RpcEnv, "ENVIRONMENT" | "SITE_URL"> = {
  ENVIRONMENT: "production",
  SITE_URL: `${SITE}/`,
};
const DEV: Pick<RpcEnv, "ENVIRONMENT" | "SITE_URL"> = {
  ENVIRONMENT: "dev",
  SITE_URL: "http://localhost:5173",
};

describe("isForeignRequest", () => {
  it("rejects a cross-site or same-site Sec-Fetch-Site", () => {
    expect(
      isForeignRequest(request({ "sec-fetch-site": "cross-site" }), PRODUCTION)
    ).toBe(true);
    expect(
      isForeignRequest(request({ "sec-fetch-site": "same-site" }), PRODUCTION)
    ).toBe(true);
  });

  it("accepts a same-origin or user-initiated (none) Sec-Fetch-Site", () => {
    expect(
      isForeignRequest(
        request({ origin: SITE, "sec-fetch-site": "same-origin" }),
        PRODUCTION
      )
    ).toBe(false);
    expect(
      isForeignRequest(request({ "sec-fetch-site": "none" }), PRODUCTION)
    ).toBe(false);
  });

  it("rejects an Origin other than the SITE_URL origin (and the opaque null)", () => {
    expect(
      isForeignRequest(request({ origin: "https://evil.example" }), PRODUCTION)
    ).toBe(true);
    expect(
      isForeignRequest(
        request({ origin: "https://staging.smog.vlaanderen" }),
        PRODUCTION
      )
    ).toBe(true);
    expect(isForeignRequest(request({ origin: "null" }), PRODUCTION)).toBe(
      true
    );
    expect(isForeignRequest(request({ origin: SITE }), PRODUCTION)).toBe(false);
  });

  it("rejects a same-origin Sec-Fetch-Site with a foreign Origin", () => {
    expect(
      isForeignRequest(
        request({
          origin: "https://evil.example",
          "sec-fetch-site": "same-origin",
        }),
        PRODUCTION
      )
    ).toBe(true);
  });

  it("allows any http://localhost port in dev only", () => {
    const expo = request({ origin: "http://localhost:8081" });
    expect(isForeignRequest(expo, DEV)).toBe(false);
    expect(isForeignRequest(expo, { ...DEV, ENVIRONMENT: "staging" })).toBe(
      true
    );
    expect(isForeignRequest(expo, PRODUCTION)).toBe(true);
    expect(
      isForeignRequest(
        request({ origin: "http://localhost.evil.example" }),
        DEV
      )
    ).toBe(true);
  });

  it("lets requests with neither header through (native app, curl)", () => {
    expect(isForeignRequest(request({}), PRODUCTION)).toBe(false);
  });

  it("never checks GET and HEAD", () => {
    const get = request(
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      "GET"
    );
    expect(isForeignRequest(get, PRODUCTION)).toBe(false);
  });
});

describe("rpcHandlerOptions: checkOrigin runs first", () => {
  function setup() {
    const keys: string[] = [];
    const RL_API: RateLimiter = {
      limit: ({ key }) => {
        keys.push(key);
        return Promise.resolve({ success: true });
      },
    };
    const getSession = vi.fn(() => Promise.resolve(makeSession("user")));
    const auth = { api: { getSession } } as unknown as Auth;
    const handler = new RPCHandler<RpcContext>(
      {
        me: publicProcedure.handler(
          ({ context }) => context.session?.user.id ?? null
        ),
      },
      rpcHandlerOptions
    );
    async function post(headers: Record<string, string>): Promise<Response> {
      const req = request({
        cookie: "__Secure-smog.session_token=x",
        ...headers,
      });
      const { response } = await handler.handle(req, {
        context: makeRpcContext({
          auth,
          env: { ...PRODUCTION, RL_API },
          request: req,
        }),
        prefix: "/api/rpc",
      });
      if (!response) {
        throw new Error("no response");
      }
      return response;
    }
    return { getSession, keys, post };
  }

  it("answers a cross-site POST with a defined FORBIDDEN before the limit and the session", async () => {
    const { getSession, keys, post } = setup();

    const response = await post({
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      json: { code: "FORBIDDEN", defined: true, status: 403 },
    });
    expect(keys).toEqual([]);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("passes a same-origin POST and a POST with neither header", async () => {
    const { post } = setup();

    const same = await post({ origin: SITE, "sec-fetch-site": "same-origin" });
    expect(await same.json()).toEqual({ json: "user-1" });

    const native = await post({});
    expect(await native.json()).toEqual({ json: "user-1" });
  });
});
