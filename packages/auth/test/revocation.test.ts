import { session, user } from "@smog/db";
import { makeUser } from "@smog/db/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getSession, requireAdminUser } from "../src/session";
import { codeIn, cookieHeader, setup, uniqueEmail } from "./helpers";

async function signedIn(
  ctx: ReturnType<typeof setup>,
  role: "user" | "admin" = "user"
) {
  const email = uniqueEmail();
  const member = await makeUser(ctx.db, { email, emailVerified: true, role });
  await ctx.call("/email-otp/send-verification-otp", {
    body: { email, type: "sign-in" },
  });
  const otp = codeIn(ctx.email.sent.at(-1)?.text);
  const response = await ctx.call("/sign-in/email-otp", {
    body: { email, otp },
  });
  return { headers: new Headers({ cookie: cookieHeader(response) }), member };
}

describe("sessions are read from D1 (I1)", () => {
  it("a session whose D1 row is gone is no longer valid", async () => {
    const ctx = setup();
    const { headers, member } = await signedIn(ctx);
    expect(await getSession(ctx.auth, headers)).not.toBeNull();

    await ctx.db.delete(session).where(eq(session.userId, member.id));

    expect(await getSession(ctx.auth, headers)).toBeNull();
  });

  it("a banned user's existing session stops working at once", async () => {
    const ctx = setup();
    const admin = await signedIn(ctx, "admin");
    const target = await signedIn(ctx);

    const ban = await ctx.auth.api.banUser({
      body: { userId: target.member.id },
      headers: admin.headers,
    });

    expect(ban.user.banned).toBe(true);
    expect(await getSession(ctx.auth, target.headers)).toBeNull();
  });

  it("a deleted user's session stops working at once", async () => {
    const ctx = setup();
    const { headers, member } = await signedIn(ctx);

    await ctx.db.delete(user).where(eq(user.id, member.id));

    expect(await getSession(ctx.auth, headers)).toBeNull();
  });

  it("a demoted admin is refused at once", async () => {
    const ctx = setup();
    const { headers, member } = await signedIn(ctx, "admin");
    expect(requireAdminUser(await getSession(ctx.auth, headers)).id).toBe(
      member.id
    );

    await ctx.db
      .update(user)
      .set({ role: "user" })
      .where(eq(user.id, member.id));

    expect(() => requireAdminUser(null)).toThrow("UNAUTHORIZED");
    const current = await getSession(ctx.auth, headers);
    expect(() => requireAdminUser(current)).toThrow("FORBIDDEN");
  });
});

describe("Better Auth's own rate limiter (I3)", () => {
  it("never limits session reads, even from one shared IP", async () => {
    const ctx = setup({
      ENVIRONMENT: "staging",
      SITE_URL: "https://smog-site-staging.workers.dev",
    });
    const context = await ctx.auth.$context;
    expect(context.rateLimit.enabled).toBe(true);
    expect(context.rateLimit.storage).toBe("memory");

    const statuses = new Set<number>();
    for (let i = 0; i < 150; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one client polling in sequence.
      const response = await ctx.call("/get-session", {
        headers: { "cf-connecting-ip": "203.0.113.7" },
      });
      statuses.add(response.status);
    }

    expect([...statuses]).toEqual([200]);
  });
});
