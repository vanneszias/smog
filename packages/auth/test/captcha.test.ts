import { makeUser } from "@smog/db/testing";
import { describe, expect, it, vi } from "vitest";
import { CAPTCHA_ENDPOINTS } from "../src/server";
import { PASSWORD, SITE_URL, setup, uniqueEmail } from "./helpers";

interface Endpoint {
  options?: { method?: string | string[] };
  path?: string;
}

const OTP_TYPES = ["sign-in", "email-verification", "forget-password"];

/** Every POST path without a path parameter, from the auth instance. */
function postPaths(api: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  for (const value of Object.values(api)) {
    const endpoint = value as Endpoint;
    const methods = [endpoint.options?.method ?? []].flat();
    if (
      endpoint.path &&
      !endpoint.path.includes(":") &&
      methods.includes("POST")
    ) {
      paths.add(endpoint.path);
    }
  }
  return [...paths].sort();
}

describe("captcha endpoints (I2)", () => {
  it.each([
    {
      accepted: true,
      environment: "staging",
      ip: "192.0.2.1",
      success: true,
      testKey: true,
    },
    {
      accepted: false,
      environment: "staging",
      ip: "192.0.2.2",
      success: true,
      testKey: false,
    },
    {
      accepted: false,
      environment: "production",
      ip: "192.0.2.3",
      success: true,
      testKey: true,
    },
    {
      accepted: false,
      environment: "staging",
      ip: "192.0.2.4",
      success: false,
      testKey: true,
    },
  ] as const)(
    "limits the dummy hostname exception: $environment / testKey=$testKey / success=$success",
    async ({ environment, ip, testKey, success, accepted }) => {
      const guarded = setup({
        ENVIRONMENT: environment,
        TURNSTILE_SECRET_KEY: testKey
          ? "1x0000000000000000000000000000000AA"
          : "real-turnstile-secret",
      });
      const email = uniqueEmail();
      await makeUser(guarded.db, { email, emailVerified: true });
      const verify = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({ hostname: "example.com", success }));
      try {
        const response = await guarded.call("/request-password-reset", {
          body: { email, redirectTo: `${SITE_URL}/reset-password` },
          headers: {
            "cf-connecting-ip": ip,
            "x-captcha-response": "XXXX.DUMMY.TOKEN.XXXX",
          },
        });
        expect(verify).toHaveBeenCalled();
        expect(response.ok).toBe(accepted);
        expect(guarded.email.sent).toHaveLength(accepted ? 1 : 0);
      } finally {
        verify.mockRestore();
      }
    }
  );

  it("cover every endpoint that sends an email without a session", {
    timeout: 120_000,
  }, async () => {
    const ctx = setup();
    const unverified = uniqueEmail();
    await ctx.call("/sign-up/email", {
      body: { email: unverified, name: "U", password: PASSWORD },
    });
    const verified = uniqueEmail();
    await makeUser(ctx.db, { email: verified, emailVerified: true });

    const senders = new Set<string>();
    for (const path of postPaths(ctx.auth.api)) {
      for (const email of [uniqueEmail(), unverified, verified]) {
        for (const type of OTP_TYPES) {
          const before = ctx.email.sent.length;
          // biome-ignore lint/performance/noAwaitInLoops: counts the mails each call sends.
          await ctx.call(path, {
            body: {
              callbackURL: "/",
              email,
              name: "Probe",
              password: PASSWORD,
              redirectTo: `${SITE_URL}/reset-password`,
              type,
            },
          });
          if (ctx.email.sent.length > before) {
            senders.add(path);
          }
        }
      }
    }

    expect([...senders].sort()).toEqual(
      expect.arrayContaining([
        "/email-otp/request-password-reset",
        "/email-otp/send-verification-otp",
        "/forget-password/email-otp",
        "/request-password-reset",
        "/send-verification-email",
        "/sign-in/magic-link",
        "/sign-up/email",
      ])
    );
    for (const path of senders) {
      expect(CAPTCHA_ENDPOINTS).toContain(path);
    }
  });

  it("also refuses the Expo app without a token (known gap, DECISIONS)", async () => {
    const guarded = setup({ TURNSTILE_SECRET_KEY: "turnstile-secret" });

    const response = await guarded.call("/email-otp/send-verification-otp", {
      body: { email: uniqueEmail(), type: "sign-in" },
      // What the Expo client sends; any client can send it, so it cannot
      // be an exemption.
      headers: { "expo-origin": "smog://", origin: "smog://" },
    });

    expect(response.status).toBe(400);
    expect(guarded.email.sent).toHaveLength(0);
  });

  it.each([
    "/email-otp/request-password-reset",
    "/forget-password/email-otp",
    "/send-verification-email",
  ])("requires a Turnstile token on %s when keyed", async (path) => {
    const guarded = setup({ TURNSTILE_SECRET_KEY: "turnstile-secret" });
    const email = uniqueEmail();
    await makeUser(guarded.db, { email, emailVerified: false });

    const response = await guarded.call(path, {
      body: { callbackURL: "/", email, type: "forget-password" },
    });

    expect(response.status).toBe(400);
    expect(guarded.email.sent).toHaveLength(0);
  });
});
