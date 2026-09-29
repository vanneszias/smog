import type { ContractRouterClient } from "@orpc/contract";
import { call } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { favoritesContract } from "@smog/favorites/contract";
import { gesturesContract } from "@smog/gestures/contract";
import { implementRpc, requireTurnstile } from "@smog/rpc";
import { baseContract, type RpcClientContext } from "@smog/rpc/contract";
import { makeRpcContext, makeSession } from "@smog/rpc/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient, createApiQueryUtils } from "../src/client";
import { appRouter } from "../src/index";

describe("appRouter.system", () => {
  it("health returns ok with the environment", async () => {
    const context = makeRpcContext({ env: { ENVIRONMENT: "staging" } });
    expect(await call(appRouter.system.health, undefined, { context })).toEqual(
      { environment: "staging", ok: true }
    );
  });

  it("authConfig returns the public auth setup only", async () => {
    const context = makeRpcContext({
      env: {
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        TURNSTILE_SECRET_KEY: "turnstile-secret",
        TURNSTILE_SITE_KEY: "turnstile-site",
      },
    });
    expect(
      await call(appRouter.system.authConfig, undefined, { context })
    ).toEqual({
      apple: false,
      google: true,
      turnstileSiteKey: "turnstile-site",
    });
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

afterEach(() => {
  vi.restoreAllMocks();
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

  it("sends a per-call turnstileToken that requireTurnstile accepts", async () => {
    // A public mutation guarded like sponsor checkout, served in-process.
    const checkoutContract = {
      sponsorships: { checkout: baseContract.output(z.literal("paid")) },
    };
    const rpc = implementRpc(checkoutContract);
    const checkoutHandler = new RPCHandler(
      rpc.router({
        sponsorships: {
          checkout: rpc.sponsorships.checkout
            .use(requireTurnstile)
            .handler(() => "paid" as const),
        },
      })
    );
    const siteverify = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true }));
    const client = createApiClient({
      baseUrl: "https://smog.test",
      fetch: async (request) => {
        const { response } = await checkoutHandler.handle(request, {
          context: makeRpcContext({
            env: { TURNSTILE_SECRET_KEY: "secret" },
            request,
          }),
          prefix: "/api/rpc",
        });
        return response ?? new Response(null, { status: 404 });
      },
    }) as unknown as ContractRouterClient<
      typeof checkoutContract,
      RpcClientContext
    >;

    await expect(client.sponsorships.checkout()).rejects.toMatchObject({
      code: "TURNSTILE_FAILED",
      defined: true,
    });
    expect(siteverify).not.toHaveBeenCalled();

    expect(
      await client.sponsorships.checkout(undefined, {
        context: { turnstileToken: "widget-token" },
      })
    ).toBe("paid");
    const body = siteverify.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("response")).toBe("widget-token");
  });

  it("mounts the gestures slice under `gestures`", async () => {
    expect(Object.keys(appRouter.gestures).sort()).toEqual(
      Object.keys(gesturesContract).sort()
    );
    const client = createApiClient({
      baseUrl: "https://smog.test",
      fetch: serve,
    });

    // Contract validation runs before the handler (and its D1 reads).
    await expect(
      client.gestures.search({ q: "x".repeat(101) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(seen.at(-1)?.url).toBe("https://smog.test/api/rpc/gestures/search");
  });

  it("mounts the favorites slice under `favorites`, signed-in only", async () => {
    expect(Object.keys(appRouter.favorites).sort()).toEqual(
      Object.keys(favoritesContract).sort()
    );
    const client = createApiClient({
      baseUrl: "https://smog.test",
      fetch: serve,
    });

    await expect(client.favorites.ids()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      defined: true,
    });
    expect(seen.at(-1)?.url).toBe("https://smog.test/api/rpc/favorites/ids");
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
