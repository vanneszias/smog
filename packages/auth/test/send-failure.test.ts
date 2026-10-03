import { makeUser } from "@smog/db/testing";
import type { EmailTemplateId } from "@smog/email";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSWORD, setup, uniqueEmail } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

type Ctx = ReturnType<typeof setup>;

interface Case {
  /** Makes the account the request needs, if any. */
  arrange?: (ctx: Ctx, email: string) => Promise<void>;
  body: (email: string) => Record<string, unknown>;
  path: string;
  template: EmailTemplateId;
}

async function verified(ctx: Ctx, email: string): Promise<void> {
  await makeUser(ctx.db, { email, emailVerified: true });
}

async function unverified(ctx: Ctx, email: string): Promise<void> {
  await makeUser(ctx.db, { email, emailVerified: false });
}

/*
 * Every endpoint that mails a code or a link (CAPTCHA_ENDPOINTS' senders):
 * when the outbox cannot take the email (the queue stayed down through its
 * retries), the request fails, so the user asks again instead of waiting
 * for an email that was never queued (review I1).
 */
const CASES: [string, Case][] = [
  [
    "sign-up (verification link)",
    {
      body: (email) => ({ email, name: "Ada", password: PASSWORD }),
      path: "/sign-up/email",
      template: "auth/verify-email",
    },
  ],
  [
    "resend the verification link",
    {
      arrange: unverified,
      body: (email) => ({ email }),
      path: "/send-verification-email",
      template: "auth/verify-email",
    },
  ],
  [
    "reset link",
    {
      arrange: verified,
      body: (email) => ({ email }),
      path: "/request-password-reset",
      template: "auth/reset-password",
    },
  ],
  [
    "sign-in code",
    {
      arrange: verified,
      body: (email) => ({ email, type: "sign-in" }),
      path: "/email-otp/send-verification-otp",
      template: "auth/otp",
    },
  ],
  [
    "sign-up code (no account yet)",
    {
      body: (email) => ({ email, type: "sign-in" }),
      path: "/email-otp/send-verification-otp",
      template: "auth/otp",
    },
  ],
  [
    "verification code",
    {
      arrange: unverified,
      body: (email) => ({ email, type: "email-verification" }),
      path: "/email-otp/send-verification-otp",
      template: "auth/otp",
    },
  ],
  [
    "reset code",
    {
      arrange: verified,
      body: (email) => ({ email }),
      path: "/email-otp/request-password-reset",
      template: "auth/otp",
    },
  ],
  [
    "reset code (forget-password)",
    {
      arrange: verified,
      body: (email) => ({ email }),
      path: "/forget-password/email-otp",
      template: "auth/otp",
    },
  ],
  [
    "magic link",
    {
      body: (email) => ({ callbackURL: "/", email }),
      path: "/sign-in/magic-link",
      template: "auth/magic-link",
    },
  ],
];

describe("a failed hand-off to the outbox", () => {
  it.each(CASES)("fails the request: %s", async (_name, test) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = setup();
    const email = uniqueEmail();
    await test.arrange?.(ctx, email);
    ctx.outbox.failTemplate(test.template);

    const response = await ctx.call(test.path, { body: test.body(email) });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(ctx.email.sent).toEqual([]);
  });

  it("answers EMAIL_NOT_SENT where Better Auth would have swallowed it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = setup();
    const email = uniqueEmail();
    await verified(ctx, email);
    ctx.outbox.failTemplate("auth/otp");

    const response = await ctx.call("/email-otp/send-verification-otp", {
      body: { email, type: "sign-in" },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_SENT" });
  });

  it("still answers 200 when the outbox takes the email", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await verified(ctx, email);

    const response = await ctx.call("/email-otp/send-verification-otp", {
      body: { email, type: "sign-in" },
    });

    expect(response.status).toBe(200);
    expect(ctx.email.sent).toHaveLength(1);
  });
});
