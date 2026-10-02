import { env } from "cloudflare:workers";
import { makeUser } from "@smog/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN_DISABLED_PATHS } from "../src/server";
import {
  cookieHeader,
  findUser,
  PASSWORD,
  SITE_URL,
  setup,
  uniqueEmail,
} from "./helpers";

/*
 * Ruling 6: every `/admin/*` endpoint of Better Auth's admin plugin is off
 * over HTTP (an admin could otherwise change roles or ban with no audit),
 * and still callable through `auth.api`, which `@smog/admin` uses with the
 * request's headers. The paths come from the configured instance, so a new
 * admin endpoint in a Better Auth update fails this test until it is listed.
 */

interface Endpoint {
  options?: { method?: string | string[] };
  path?: string;
}

/** Every endpoint path of the instance under `/admin/`. */
function adminPaths(api: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  for (const value of Object.values(api)) {
    const { path } = value as Endpoint;
    if (path?.startsWith("/admin/")) {
      paths.add(path);
    }
  }
  return [...paths].sort();
}

function methodsOf(api: Record<string, unknown>, path: string): string[] {
  const endpoint = Object.values(api).find(
    (value) => (value as Endpoint).path === path
  ) as Endpoint | undefined;
  return [endpoint?.options?.method ?? "GET"].flat();
}

const ctx = setup();
let adminCookie: string;
let adminHeaders: Headers;

beforeAll(async () => {
  const email = uniqueEmail();
  await ctx.call("/sign-up/email", {
    body: { email, name: "Ada Admin", password: PASSWORD },
  });
  await env.DB.prepare(
    "UPDATE user SET email_verified = 1, role = 'admin' WHERE email = ?"
  )
    .bind(email)
    .run();
  const signIn = await ctx.call("/sign-in/email", {
    body: { email, password: PASSWORD },
  });
  adminCookie = cookieHeader(signIn);
  adminHeaders = new Headers({ cookie: adminCookie, origin: SITE_URL });
});

describe("the admin plugin's HTTP endpoints (ruling 6)", () => {
  it("are all in ADMIN_DISABLED_PATHS, and the list has no stale path", () => {
    const paths = adminPaths(ctx.auth.api);
    expect(paths.length).toBeGreaterThanOrEqual(15);
    expect(paths).toContain("/admin/set-role");
    expect([...ADMIN_DISABLED_PATHS].sort()).toEqual(paths);
  });

  it("answer 404 over HTTP, even for an admin", async () => {
    const target = await makeUser(ctx.db);
    const answers: Record<string, number> = {};
    for (const path of adminPaths(ctx.auth.api)) {
      for (const method of methodsOf(ctx.auth.api, path)) {
        // biome-ignore lint/performance/noAwaitInLoops: one status per path.
        const response = await ctx.call(path, {
          body:
            method === "GET"
              ? undefined
              : { banReason: "x", role: "admin", userId: target.id },
          cookie: adminCookie,
          method,
        });
        answers[`${method} ${path}`] = response.status;
      }
    }
    expect(Object.values(answers).length).toBeGreaterThanOrEqual(15);
    expect(
      Object.entries(answers).filter(([, status]) => status !== 404)
    ).toEqual([]);
    expect((await findUser(ctx.db, target.email))?.role).toBe("user");
    expect((await findUser(ctx.db, target.email))?.banned).toBe(false);
  });

  it("stay callable through auth.api with an admin's headers", async () => {
    const target = await makeUser(ctx.db);
    await ctx.auth.api.setRole({
      body: { role: "admin", userId: target.id },
      headers: adminHeaders,
    });
    await ctx.auth.api.setRole({
      body: { role: "user", userId: target.id },
      headers: adminHeaders,
    });
    await ctx.auth.api.banUser({
      body: { banReason: "Spam", userId: target.id },
      headers: adminHeaders,
    });
    expect((await findUser(ctx.db, target.email))?.banned).toBe(true);
    await ctx.auth.api.unbanUser({
      body: { userId: target.id },
      headers: adminHeaders,
    });
    expect((await findUser(ctx.db, target.email))?.banned).toBe(false);
    const listed = await ctx.auth.api.listUsers({
      headers: adminHeaders,
      query: { limit: 1 },
    });
    expect(listed.users.length).toBe(1);
    await ctx.auth.api.removeUser({
      body: { userId: target.id },
      headers: adminHeaders,
    });
    expect(await findUser(ctx.db, target.email)).toBeUndefined();
  });

  it("keep the create hook for auth.api.createUser: no photo, a name of 1..80", async () => {
    const refused = async (data: object) => {
      try {
        await ctx.auth.api.createUser({
          body: { email: uniqueEmail(), password: PASSWORD, ...data } as never,
          headers: adminHeaders,
        });
      } catch (error) {
        return (error as { body?: { code?: string } }).body?.code;
      }
      return null;
    };
    expect(await refused({ name: "x".repeat(81) })).toBe("INVALID_NAME");
    expect(
      await refused({
        data: { image: "https://example.com/a.png" },
        name: "Ok",
      })
    ).toBe("INVALID_IMAGE");
  });
});
