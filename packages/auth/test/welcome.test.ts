import { runWithEndpointContext } from "@better-auth/core/context";
import { makeUser } from "@smog/db/testing";
import type { OutboxEmail } from "@smog/email";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  codeIn,
  findUser,
  linkIn,
  PASSWORD,
  SITE_URL,
  setup,
  uniqueEmail,
} from "./helpers";

type Ctx = ReturnType<typeof setup>;

afterEach(() => {
  vi.restoreAllMocks();
});

function welcomes(ctx: Ctx): OutboxEmail[] {
  return ctx.outbox.sent.filter(
    (email) => email.template === "transactional/welcome"
  );
}

/** The newest email of a template the outbox got (its rendered text). */
function lastText(ctx: Ctx): string | undefined {
  return ctx.email.sent.at(-1)?.text;
}

async function signUpAndVerify(ctx: Ctx, email: string): Promise<void> {
  const signUp = await ctx.call("/sign-up/email", {
    // The account's language (the sign-up form sends the page's).
    body: { email, locale: "fr", name: "Ada", password: PASSWORD },
  });
  expect(signUp.status).toBe(200);
  expect(welcomes(ctx)).toEqual([]);
  const verify = await ctx.call(linkIn(lastText(ctx)));
  expect(verify.status).toBe(302);
}

/*
 * Welcome (E-01, ruling 8): one email per account, when its address
 * becomes verified, keyed `welcome:<userId>` so the consumer also drops a
 * redelivery. Never from the sign-in-only server.
 */
describe("the welcome email", () => {
  it("is queued once when a sign-up verifies its address", async () => {
    const ctx = setup();
    const email = uniqueEmail();

    await signUpAndVerify(ctx, email);

    const member = await findUser(ctx.db, email);
    expect(member?.emailVerified).toBe(true);
    expect(welcomes(ctx)).toEqual([
      {
        idempotencyKey: `welcome:${member?.id}`,
        locale: "fr",
        props: { name: "Ada", url: SITE_URL },
        template: "transactional/welcome",
        to: email,
      },
    ]);
  });

  it("is not queued again by a later update or a second verification", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await signUpAndVerify(ctx, email);
    const member = await findUser(ctx.db, email);

    // The link again (Better Auth returns early for a verified address).
    await ctx.call("/send-verification-email", { body: { email } });
    // A code verification of the same, already verified, address.
    await ctx.call("/email-otp/send-verification-otp", {
      body: { email, type: "email-verification" },
    });
    const otp = codeIn(lastText(ctx));
    const reverify = await ctx.call("/email-otp/verify-email", {
      body: { email, otp },
    });
    expect(reverify.status).toBe(200);
    // Any other update of the user.
    const context = await ctx.auth.$context;
    await context.internalAdapter.updateUser(member?.id ?? "", {
      name: "Ada L.",
    });

    expect(welcomes(ctx)).toHaveLength(1);
  });

  it("is queued once for an account created verified (a code sign-up)", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    const codeSignIn = async () => {
      await ctx.call("/email-otp/send-verification-otp", {
        body: { email, type: "sign-in" },
      });
      const response = await ctx.call("/sign-in/email-otp", {
        body: { email, otp: codeIn(lastText(ctx)) },
      });
      expect(response.status).toBe(200);
    };

    await codeSignIn();
    await codeSignIn();

    const member = await findUser(ctx.db, email);
    expect(welcomes(ctx).map((sent) => sent.idempotencyKey)).toEqual([
      `welcome:${member?.id}`,
    ]);
  });

  it("is queued for a social sign-up that arrives verified (create hook)", async () => {
    const ctx = setup();
    const context = await ctx.auth.$context;
    const email = uniqueEmail();

    const created = await context.internalAdapter.createUser(
      { email, emailVerified: true, locale: "en", name: "Grace" },
      { method: "google" }
    );

    expect(welcomes(ctx)).toEqual([
      {
        idempotencyKey: `welcome:${created.id}`,
        locale: "en",
        props: { name: "Grace", url: SITE_URL },
        template: "transactional/welcome",
        to: email,
      },
    ]);
  });

  it("is not queued for an account that is still unverified", async () => {
    const ctx = setup();
    await ctx.call("/sign-up/email", {
      body: { email: uniqueEmail(), name: "Ada", password: PASSWORD },
    });
    expect(welcomes(ctx)).toEqual([]);
  });

  it("is never queued by the sign-in-only server", async () => {
    const ctx = setup({}, { signInOnly: true });
    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: false });

    // A magic link verifies the address it signs in with.
    await ctx.call("/sign-in/magic-link", {
      body: { callbackURL: "/", email },
    });
    const verify = await ctx.call(linkIn(lastText(ctx)));
    expect(verify.status).toBe(302);

    expect((await findUser(ctx.db, email))?.emailVerified).toBe(true);
    expect(welcomes(ctx)).toEqual([]);
  });

  it("does not fail the verification when the outbox is down (logged)", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const ctx = setup();
    const email = uniqueEmail();
    ctx.outbox.failTemplate("transactional/welcome");

    await signUpAndVerify(ctx, email);

    expect((await findUser(ctx.db, email))?.emailVerified).toBe(true);
    expect(error).toHaveBeenCalledWith(
      "[auth] Failed to queue the welcome email:",
      expect.any(Error)
    );
  });
});

/*
 * The Better Auth 1.7.6 paths that verify an existing, unverified account
 * (review M7). `becomesVerified` relies on each of them writing only the
 * flag after checking it was false; an upgrade that changes one fails here.
 */
describe("the welcome email on every path that verifies an existing account", () => {
  it("a magic link to an unverified account (open server)", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    const member = await makeUser(ctx.db, { email, emailVerified: false });

    await ctx.call("/sign-in/magic-link", {
      body: { callbackURL: "/", email },
    });
    const verify = await ctx.call(linkIn(lastText(ctx)));
    expect(verify.status).toBe(302);

    expect(welcomes(ctx).map((sent) => sent.idempotencyKey)).toEqual([
      `welcome:${member.id}`,
    ]);
  });

  it("a password reset by code for an unverified account", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    const member = await makeUser(ctx.db, { email, emailVerified: false });

    await ctx.call("/email-otp/request-password-reset", { body: { email } });
    const reset = await ctx.call("/email-otp/reset-password", {
      body: { email, otp: codeIn(lastText(ctx)), password: PASSWORD },
    });
    expect(reset.status).toBe(200);

    expect((await findUser(ctx.db, email))?.emailVerified).toBe(true);
    expect(welcomes(ctx).map((sent) => sent.idempotencyKey)).toEqual([
      `welcome:${member.id}`,
    ]);
  });

  it("account linking over an unverified local account (a flag-only update in an endpoint)", async () => {
    const ctx = setup();
    const context = await ctx.auth.$context;
    const email = uniqueEmail();
    const member = await makeUser(ctx.db, { email, emailVerified: false });

    // What `oauth2/link-account.mjs` does once the provider vouches for the
    // address: `updateUser(id, { emailVerified: true })` inside the callback.
    await runWithEndpointContext({ context } as never, () =>
      context.internalAdapter.updateUser(member.id, { emailVerified: true })
    );

    expect(welcomes(ctx).map((sent) => sent.idempotencyKey)).toEqual([
      `welcome:${member.id}`,
    ]);
  });

  it("an update that matched no row sends nothing and does not throw (M1)", async () => {
    const ctx = setup();
    const context = await ctx.auth.$context;

    await expect(
      runWithEndpointContext({ context } as never, () =>
        context.internalAdapter.updateUser("no-such-user", {
          emailVerified: true,
        })
      )
    ).resolves.not.toThrow();
    expect(welcomes(ctx)).toEqual([]);
  });
});
