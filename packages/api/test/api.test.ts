import { call } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { makeRpcContext, makeSession } from "@smog/rpc/testing";
import { describe, expect, it } from "vitest";
import { createApiClient, createApiQueryUtils } from "../src/client";
import { appRouter } from "../src/index";

describe("appRouter.system", () => {
  it("health returns ok with the environment", async () => {
    const context = makeRpcContext({ env: { ENVIRONMENT: "staging" } });
    expect(await call(appRouter.system.health, undefined, { context })).toEqual(
      { environment: "staging", ok: true }
    );
  });

  it("whoami returns null for a guest", async () => {
    expect(
      await call(appRouter.system.whoami, undefined, {
        context: makeRpcContext(),
      })
    ).toEqual({ user: null });
  });

  it("whoami returns the public user fields only", async () => {
    const context = makeRpcContext({ session: makeSession("admin") });
    expect(await call(appRouter.system.whoami, undefined, { context })).toEqual(
      {
        user: {
          email: "a@smog.test",
          id: "user-1",
          image: null,
          name: "A",
          role: "admin",
        },
      }
    );
  });
});

describe("createApiClient", () => {
  const handler = new RPCHandler(appRouter);
  const seen: Request[] = [];

  /** Serves the app router in-process, like the site's `/api/rpc/*` route. */
  async function serve(request: Request): Promise<Response> {
    seen.push(request);
    const { response } = await handler.handle(request, {
      context: makeRpcContext(),
      prefix: "/api/rpc",
    });
    return response ?? new Response("not found", { status: 404 });
  }

  it("calls /api/rpc on the base URL with the given headers", async () => {
    const client = createApiClient({
      baseUrl: "https://smog.test",
      fetch: serve,
      headers: () => ({ cookie: "smog.session_token=abc" }),
    });

    expect(await client.system.health()).toEqual({
      environment: "dev",
      ok: true,
    });
    const request = seen.at(-1);
    expect(request?.url).toBe("https://smog.test/api/rpc/system/health");
    expect(request?.headers.get("cookie")).toBe("smog.session_token=abc");
  });

  it("builds TanStack Query options with a stable key", () => {
    const utils = createApiQueryUtils(
      createApiClient({ baseUrl: "https://smog.test", fetch: serve })
    );
    const options = utils.system.health.queryOptions();
    expect(options.queryKey).toEqual(utils.system.health.queryKey());
    expect(JSON.stringify(options.queryKey)).toContain("health");
  });
});
