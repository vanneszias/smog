import { env } from "cloudflare:workers";
import { account, session } from "@smog/db";
import { makeUser } from "@smog/db/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getSession, requireAdminUser } from "../src/session";
import {
  codeIn,
  cookieHeader,
  findUser,
  linkIn,
  PASSWORD,
  SITE_URL,
  sessionCookie,
  setup,
  uniqueEmail,
} from "./helpers";

const SECURE = /;\s*Secure/i;
const OTP_SUBJECT = /^\d{6} is je code/;
const SECURE_SESSION_COOKIE = /^__Secure-smog\.session_token=/;
const SESSION_COOKIE = /^smog\.session_token=/;

async function signUp(
  ctx: ReturnType<typeof setup>,
  email: string,
  extra: Record<string, unknown> = {}
): Promise<Response> {
  return await ctx.call("/sign-up/email", {
    body: { email, name: "Ada", password: PASSWORD, ...extra },
  });
}

/** Signs in with an email code and returns the session cookie header. */
async function signInWithOtp(
  ctx: ReturnType<typeof setup>,
  email: string
): Promise<Response> {
  const sent = await ctx.call("/email-otp/send-verification-otp", {
    body: { email, type: "sign-in" },
  });
  expect(sent.status).toBe(200);
  const otp = codeIn(ctx.email.sent.at(-1)?.text);
  return await ctx.call("/sign-in/email-otp", { body: { email, otp } });
}

describe("email + password", () => {
  it("(a) sign-up sends one verification email and does not sign in", async () => {
    const ctx = setup();
    const email = uniqueEmail();

    const response = await signUp(ctx, email);

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toBeUndefined();
    expect(ctx.email.sent).toHaveLength(1);
    const [message] = ctx.email.sent;
    expect(message?.to).toBe(email);
    expect(message?.from).toBe(ctx.authEnv.EMAIL_FROM);
    expect(message?.replyTo).toBe(ctx.authEnv.EMAIL_REPLY_TO);
    expect(message?.subject).toBe("Bevestig je e-mailadres");
    expect(linkIn(message?.text)).toContain("/api/auth/verify-email?token=");

    const signIn = await ctx.call("/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    expect(signIn.status).toBe(403);
  });

  it("sign-up gives the user role 'user'", async () => {
    const ctx = setup();
    const email = uniqueEmail();

    await signUp(ctx, email);

    expect((await findUser(ctx.db, email))?.role).toBe("user");
  });

  it("(b) the verification link verifies the address and signs in", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await signUp(ctx, email);

    const verify = await ctx.call(linkIn(ctx.email.sent[0]?.text));

    expect(verify.status).toBe(302);
    expect(sessionCookie(verify)).toBeDefined();
    const current = await getSession(
      ctx.auth,
      new Headers({ cookie: cookieHeader(verify) })
    );
    expect(current?.user.email).toBe(email);
    expect(current?.user.emailVerified).toBe(true);
  });

  it("(e) a migrated user without a credential sets a password by reset", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    const migrated = await makeUser(ctx.db, { email, emailVerified: true });

    const request = await ctx.call("/request-password-reset", {
      body: { email, redirectTo: `${SITE_URL}/reset-password` },
    });
    expect(request.status).toBe(200);
    const [message] = ctx.email.sent;
    expect(message?.subject).toBe("Kies een nieuw wachtwoord");
    const token = new URL(linkIn(message?.text)).pathname.split("/").at(-1);

    const reset = await ctx.call("/reset-password", {
      body: { newPassword: PASSWORD, token },
    });
    expect(reset.status).toBe(200);
    const credentials = await ctx.db
      .select()
      .from(account)
      .where(eq(account.userId, migrated.id));
    expect(credentials.map((a) => a.providerId)).toEqual(["credential"]);

    const signIn = await ctx.call("/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    expect(signIn.status).toBe(200);
    expect(sessionCookie(signIn)).toBeDefined();
  });

  it("(h) a sign-up request stays within the CPU budget (< 1500 ms)", async () => {
    const ctx = setup();
    const started = performance.now();

    const response = await signUp(ctx, uniqueEmail());

    const elapsed = performance.now() - started;
    console.log(`[auth.test] sign-up took ${elapsed.toFixed(0)} ms`);
    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(1500);

    // The hash alone (workerd resolves Better Auth's scrypt to node:crypto).
    const context = await ctx.auth.$context;
    const hashStarted = performance.now();
    const hash = await context.password.hash(PASSWORD);
    const hashElapsed = performance.now() - hashStarted;
    console.log(`[auth.test] scrypt hash took ${hashElapsed.toFixed(0)} ms`);
    expect(await context.password.verify({ hash, password: PASSWORD })).toBe(
      true
    );
    expect(hashElapsed).toBeLessThan(500);
  });
});

describe("dev seed", () => {
  it("the seeded admin signs in with the dev-only password", async () => {
    const statements = env.SEED_SQL.split("\n").filter(
      (line) => line.trim() !== "" && !line.startsWith("--")
    );
    await env.DB.batch(statements.map((line) => env.DB.prepare(line)));
    const ctx = setup();

    const signIn = await ctx.call("/sign-in/email", {
      body: { email: "admin@smog.test", password: "smog-dev-admin" },
    });

    expect(signIn.status).toBe(200);
    const current = await getSession(
      ctx.auth,
      new Headers({ cookie: cookieHeader(signIn) })
    );
    expect(current?.user.role).toBe("admin");
  });
});

describe("email OTP", () => {
  it("(c) send-verification-otp (sign-in) then sign-in/email-otp returns a session", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true });

    const response = await signInWithOtp(ctx, email);

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toBeDefined();
    const body = (await response.json()) as { user: { email: string } };
    expect(body.user.email).toBe(email);
    expect(ctx.email.sent.at(-1)?.subject).toMatch(OTP_SUBJECT);
  });

  it("stores the session in D1 as well as KV (admin revocation, export)", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    const member = await makeUser(ctx.db, { email, emailVerified: true });

    await signInWithOtp(ctx, email);

    const rows = await ctx.db
      .select()
      .from(session)
      .where(eq(session.userId, member.id));
    expect(rows).toHaveLength(1);
  });
});

describe("magic link", () => {
  it("(d) the magic link creates a session", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true, locale: "en" });

    const sent = await ctx.call("/sign-in/magic-link", {
      body: { callbackURL: "/", email },
    });
    expect(sent.status).toBe(200);
    const [message] = ctx.email.sent;
    expect(message?.subject).toBe("Your SMOG & Co sign-in link");

    const verify = await ctx.call(linkIn(message?.text));

    expect(verify.status).toBe(302);
    const current = await getSession(
      ctx.auth,
      new Headers({ cookie: cookieHeader(verify) })
    );
    expect(current?.user.email).toBe(email);
  });
});

describe("account deletion over HTTP", () => {
  it("is not routed: only `account.delete` (auth.api) deletes", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    const member = await makeUser(ctx.db, { email, emailVerified: true });
    const cookie = cookieHeader(await signInWithOtp(ctx, email));

    const deleted = await ctx.call("/delete-user", { body: {}, cookie });
    const callback = await ctx.call("/delete-user/callback?token=x", {
      cookie,
    });

    expect([deleted.status, callback.status]).toEqual([404, 404]);
    expect(
      await ctx.db.query.user.findFirst({
        where: (table, { eq: is }) => is(table.id, member.id),
      })
    ).toBeDefined();
  });
});

describe("sessions and roles", () => {
  it("(f) getSession returns role 'admin' for an admin", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true, role: "admin" });

    const signedIn = await signInWithOtp(ctx, email);
    const current = await getSession(
      ctx.auth,
      new Headers({ cookie: cookieHeader(signedIn) })
    );

    expect(current?.user.role).toBe("admin");
    expect(requireAdminUser(current).email).toBe(email);
  });

  it("requireAdminUser rejects users and guests", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true });
    const signedIn = await signInWithOtp(ctx, email);
    const current = await getSession(
      ctx.auth,
      new Headers({ cookie: cookieHeader(signedIn) })
    );

    expect(current?.user.role).toBe("user");
    expect(() => requireAdminUser(current)).toThrow("FORBIDDEN");
    expect(() => requireAdminUser(null)).toThrow("UNAUTHORIZED");
    expect(await getSession(ctx.auth, new Headers())).toBeNull();
  });

  it("(g) the user's locale round-trips and picks the email language", async () => {
    const ctx = setup();
    const email = uniqueEmail();

    await signUp(ctx, email, { locale: "fr" });

    expect((await findUser(ctx.db, email))?.locale).toBe("fr");
    expect(ctx.email.sent[0]?.html).toContain('lang="fr"');

    const verify = await ctx.call(linkIn(ctx.email.sent[0]?.text));
    const current = await getSession(
      ctx.auth,
      new Headers({ cookie: cookieHeader(verify) })
    );
    expect(current?.user.locale).toBe("fr");
  });

  it("rejects an unknown locale and never lets a client set legacyId or role", async () => {
    const ctx = setup();

    const bad = await signUp(ctx, uniqueEmail(), { locale: "de" });
    expect(bad.status).toBe(400);

    const email = uniqueEmail();
    const sneaky = await signUp(ctx, email, {
      legacyId: "convex-id",
      role: "admin",
    });
    expect(sneaky.status).toBe(400);
    expect(await findUser(ctx.db, email)).toBeUndefined();
  });
});

describe("cookies and origins", () => {
  it("dev cookies are not Secure, so they work on http://localhost", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true });

    const cookie = sessionCookie(await signInWithOtp(ctx, email));

    expect(cookie).toMatch(SESSION_COOKIE);
    expect(cookie).not.toMatch(SECURE);
  });

  it("staging and production cookies are Secure", async () => {
    const ctx = setup({
      ENVIRONMENT: "staging",
      SITE_URL: "https://smog-site-staging.workers.dev",
    });
    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true });

    const cookie = sessionCookie(await signInWithOtp(ctx, email));

    expect(cookie).toMatch(SECURE_SESSION_COOKIE);
    expect(cookie).toMatch(SECURE);
  });

  it("trusts the site, smog:// and (dev only) exp:// as origins", async () => {
    const dev = setup();
    const production = setup({
      ENVIRONMENT: "production",
      SITE_URL: "https://smog-site-production.workers.dev",
    });
    const devContext = await dev.auth.$context;
    const productionContext = await production.auth.$context;

    expect(devContext.trustedOrigins).toEqual(
      expect.arrayContaining([SITE_URL, "smog://", "exp://"])
    );
    expect(productionContext.trustedOrigins).toEqual(
      expect.arrayContaining([
        "https://smog-site-production.workers.dev",
        "smog://",
      ])
    );
    expect(productionContext.trustedOrigins).not.toContain("exp://");
  });
});

describe("optional providers", () => {
  it("offers Google only when its client id is set", async () => {
    const without = setup();
    const withGoogle = setup({
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
    });

    const missing = await without.call("/sign-in/social", {
      body: { callbackURL: "/", provider: "google" },
    });
    expect(missing.status).toBe(404);

    const present = await withGoogle.call("/sign-in/social", {
      body: { callbackURL: "/", disableRedirect: true, provider: "google" },
    });
    expect(present.status).toBe(200);
    const body = (await present.json()) as { url: string };
    expect(new URL(body.url).hostname).toBe("accounts.google.com");
  });

  it("requires a Turnstile token only when TURNSTILE_SECRET_KEY is set", async () => {
    const guarded = setup({ TURNSTILE_SECRET_KEY: "turnstile-secret" });

    const response = await guarded.call("/sign-up/email", {
      body: { email: uniqueEmail(), name: "Ada", password: PASSWORD },
    });

    expect(response.status).toBe(400);
    expect(guarded.email.sent).toHaveLength(0);
  });
});
