import { call, ORPCError, os, ValidationError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  adminProcedure,
  baseContract,
  implementRpc,
  limitRequests,
  logErrors,
  mapValidationErrors,
  publicProcedure,
  type RateLimiter,
  rateLimit,
  requireTurnstile,
  requireUser,
  userProcedure,
} from "../src/index";
import { makeRpcContext, makeSession } from "../src/testing";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("userProcedure", () => {
  const whoami = userProcedure.handler(({ context }) => context.user.id);

  it("throws UNAUTHORIZED without a session", async () => {
    await expect(
      call(whoami, undefined, { context: makeRpcContext() })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", defined: true });
  });

  it("adds the user to the context", async () => {
    const context = makeRpcContext({ session: makeSession("user") });
    expect(await call(whoami, undefined, { context })).toBe("user-1");
  });
});

describe("adminProcedure", () => {
  const stats = adminProcedure.handler(() => "stats");

  it("throws FORBIDDEN for the user role", async () => {
    const context = makeRpcContext({ session: makeSession("user") });
    await expect(call(stats, undefined, { context })).rejects.toMatchObject({
      code: "FORBIDDEN",
      defined: true,
    });
  });

  it("throws UNAUTHORIZED without a session", async () => {
    await expect(
      call(stats, undefined, { context: makeRpcContext() })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lets an admin through", async () => {
    const context = makeRpcContext({ session: makeSession("admin") });
    expect(await call(stats, undefined, { context })).toBe("stats");
  });
});

describe("implementRpc", () => {
  const contract = {
    account: { me: baseContract.output(z.string()) },
  };
  const rpc = implementRpc(contract);
  const router = rpc.router({
    account: {
      me: rpc.account.me
        .use(requireUser)
        .handler(({ context }) => context.user.id),
    },
  });

  it("implements a contract slice with the guards and a typed user", async () => {
    await expect(
      call(router.account.me, undefined, { context: makeRpcContext() })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", defined: true });
    const context = makeRpcContext({ session: makeSession("user") });
    expect(await call(router.account.me, undefined, { context })).toBe(
      "user-1"
    );
  });
});

describe("rateLimit", () => {
  function limiter(success: boolean): RateLimiter & { keys: string[] } {
    const keys: string[] = [];
    return {
      keys,
      limit: ({ key }) => {
        keys.push(key);
        return Promise.resolve({ success });
      },
    };
  }

  it("throws RATE_LIMITED when the binding says success: false", async () => {
    const RL_API = limiter(false);
    const procedure = publicProcedure.use(rateLimit("RL_API")).handler(() => 1);

    await expect(
      call(procedure, undefined, {
        context: makeRpcContext({ env: { RL_API } }),
        path: ["system", "health"],
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED", defined: true });
  });

  it("keys the binding by ip and path and passes when allowed", async () => {
    const RL_SPONSOR = limiter(true);
    const procedure = publicProcedure
      .use(rateLimit("RL_SPONSOR"))
      .handler(() => "ok");

    const result = await call(procedure, undefined, {
      context: makeRpcContext({ env: { RL_SPONSOR }, ip: "203.0.113.7" }),
      path: ["sponsorships", "checkout"],
    });

    expect(result).toBe("ok");
    expect(RL_SPONSOR.keys).toEqual(["203.0.113.7:sponsorships.checkout"]);
  });
});

describe("limitRequests", () => {
  it("answers every request over the limit with RATE_LIMITED, keyed by ip", async () => {
    const keys: string[] = [];
    const RL_API: RateLimiter = {
      limit: ({ key }) => {
        keys.push(key);
        return Promise.resolve({ success: false });
      },
    };
    const handler = new RPCHandler(
      { ping: publicProcedure.handler(() => "pong") },
      { interceptors: [limitRequests("RL_API", "rpc")] }
    );

    const { response } = await handler.handle(
      new Request("https://smog.test/api/rpc/ping", {
        body: "{}",
        method: "POST",
      }),
      {
        context: makeRpcContext({ env: { RL_API }, ip: "203.0.113.9" }),
        prefix: "/api/rpc",
      }
    );

    expect(response?.status).toBe(429);
    expect(await response?.json()).toMatchObject({
      json: { code: "RATE_LIMITED" },
    });
    expect(keys).toEqual(["rpc:203.0.113.9"]);
  });
});

describe("requireTurnstile", () => {
  const checkout = publicProcedure.use(requireTurnstile).handler(() => "paid");

  function withToken(token: string | null) {
    const headers = new Headers();
    if (token) {
      headers.set("x-turnstile-token", token);
    }
    return new Request("https://smog.test/api/rpc/x", {
      headers,
      method: "POST",
    });
  }

  it("is skipped when TURNSTILE_SECRET_KEY is unset", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const context = makeRpcContext({ request: withToken(null) });

    expect(await call(checkout, undefined, { context })).toBe("paid");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails when siteverify returns success: false", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: false }));
    const context = makeRpcContext({
      env: { TURNSTILE_SECRET_KEY: "secret" },
      ip: "198.51.100.2",
      request: withToken("bad-token"),
    });

    await expect(call(checkout, undefined, { context })).rejects.toMatchObject({
      code: "TURNSTILE_FAILED",
      defined: true,
    });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    );
    const body = init?.body as FormData;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("bad-token");
    expect(body.get("remoteip")).toBe("198.51.100.2");
  });

  it("fails without a token and does not call siteverify", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const context = makeRpcContext({
      env: { TURNSTILE_SECRET_KEY: "secret" },
      request: withToken(null),
    });

    await expect(call(checkout, undefined, { context })).rejects.toMatchObject({
      code: "TURNSTILE_FAILED",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes when siteverify returns success: true", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true })
    );
    const context = makeRpcContext({
      env: { TURNSTILE_SECRET_KEY: "secret" },
      request: withToken("good-token"),
    });

    expect(await call(checkout, undefined, { context })).toBe("paid");
  });
});

describe("logErrors", () => {
  it("logs unknown errors with the [rpc:<path>] prefix and hides them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const procedure = os
      .$context<ReturnType<typeof makeRpcContext>>()
      .use(logErrors)
      .handler(() => {
        throw new Error("D1 exploded: secret internals");
      });

    const error = await call(procedure, undefined, {
      context: makeRpcContext(),
      path: ["system", "health"],
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ORPCError);
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect((error as ORPCError<string, unknown>).message).not.toContain(
      "secret internals"
    );
    expect(log).toHaveBeenCalledWith(
      "[rpc:system.health] Failed to handle the request:",
      expect.any(Error)
    );
  });

  it("passes ORPC errors through without logging", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const procedure = publicProcedure.handler(({ errors }) => {
      throw errors.NOT_FOUND();
    });

    await expect(
      call(procedure, undefined, { context: makeRpcContext() })
    ).rejects.toMatchObject({ code: "NOT_FOUND", defined: true });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("mapValidationErrors", () => {
  it("turns an input validation failure into a VALIDATION error", async () => {
    const procedure = publicProcedure
      .input(z.object({ slug: z.string().min(2) }))
      .handler(({ input }) => input.slug);

    const error = await call(
      procedure,
      { slug: "a" },
      { context: makeRpcContext(), interceptors: [mapValidationErrors] }
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: "VALIDATION",
      data: { fieldErrors: { slug: [expect.any(String)] } },
      defined: true,
      status: 422,
    });
    const { cause } = error as ORPCError<string, unknown>;
    expect(cause).toMatchObject({ code: "BAD_REQUEST" });
    expect((cause as ORPCError<string, unknown>).cause).toBeInstanceOf(
      ValidationError
    );
  });
});
