import { describe, expect, test } from "bun:test";
import {
  CAPTCHA_HEADER,
  createFlowActions,
  type FlowActionOptions,
  type FlowAuthClient,
} from "./flow-actions";

type Call = [string, unknown];

function fakeClient(error: { code?: string; status?: number } | null = null): {
  calls: Call[];
  client: FlowAuthClient;
} {
  const calls: Call[] = [];
  const answer =
    (name: string) =>
    (body: unknown): Promise<{ error: typeof error }> => {
      calls.push([name, body]);
      return Promise.resolve({ error });
    };
  return {
    calls,
    client: {
      emailOtp: { sendVerificationOtp: answer("sendVerificationOtp") },
      requestPasswordReset: answer("requestPasswordReset"),
      sendVerificationEmail: answer("sendVerificationEmail"),
      signIn: {
        email: answer("signIn.email"),
        emailOtp: answer("signIn.emailOtp"),
        magicLink: answer("signIn.magicLink"),
        social: answer("signIn.social"),
      },
      signUp: { email: answer("signUp.email") },
    },
  };
}

const OPTIONS: FlowActionOptions = {
  callbackURL: "/account",
  captchaToken: () => "turnstile-token",
  errorCallbackURL: "/magic-link",
  resetPasswordURL: "/reset-password",
  socialErrorCallbackURL: "/sign-in?error=social",
  socialFlow: { kind: "redirect" },
  verifyEmailURL: "/verify-email",
};

describe("createFlowActions", () => {
  test("sends the Turnstile token on the guarded calls", async () => {
    const { calls, client } = fakeClient();
    const actions = createFlowActions(client, OPTIONS);
    await actions.sendCode("a@smog.test");
    await actions.signInPassword("a@smog.test", "pw");
    await actions.signInCode("a@smog.test", "123456");

    const headers = { headers: { [CAPTCHA_HEADER]: "turnstile-token" } };
    expect(calls).toEqual([
      [
        "sendVerificationOtp",
        { email: "a@smog.test", fetchOptions: headers, type: "sign-in" },
      ],
      [
        "signIn.email",
        {
          callbackURL: "/account",
          email: "a@smog.test",
          fetchOptions: headers,
          password: "pw",
        },
      ],
      ["signIn.emailOtp", { email: "a@smog.test", otp: "123456" }],
    ]);
  });

  test("asks for a fresh token after each guarded request", async () => {
    const { client } = fakeClient({ code: "INVALID_OTP", status: 400 });
    let used = 0;
    const actions = createFlowActions(client, {
      ...OPTIONS,
      onCaptchaUsed: () => {
        used += 1;
      },
    });
    await actions.sendMagicLink("a@smog.test");
    await actions.signUpPassword("a@smog.test", "long enough", "A");
    await actions.signInCode("a@smog.test", "123456");
    expect(used).toBe(2);
  });

  test("a token handed to the call wins over the widget's", async () => {
    const { calls, client } = fakeClient();
    let used = 0;
    const actions = createFlowActions(client, {
      ...OPTIONS,
      onCaptchaUsed: () => {
        used += 1;
      },
    });
    await actions.sendCode("a@smog.test", "sheet-token");
    await actions.requestPasswordReset("a@smog.test", "sheet-token-2");
    expect(calls).toEqual([
      [
        "sendVerificationOtp",
        {
          email: "a@smog.test",
          fetchOptions: { headers: { [CAPTCHA_HEADER]: "sheet-token" } },
          type: "sign-in",
        },
      ],
      [
        "requestPasswordReset",
        {
          email: "a@smog.test",
          fetchOptions: { headers: { [CAPTCHA_HEADER]: "sheet-token-2" } },
          redirectTo: "/reset-password",
        },
      ],
    ]);
    // The widget's token was not used, so it needs no reset.
    expect(used).toBe(0);
  });

  test("sends no header without a token", async () => {
    const { calls, client } = fakeClient();
    await createFlowActions(client, {
      ...OPTIONS,
      captchaToken: () => null,
    }).requestPasswordReset("a@smog.test");
    expect(calls).toEqual([
      [
        "requestPasswordReset",
        { email: "a@smog.test", redirectTo: "/reset-password" },
      ],
    ]);
  });

  test("maps errors to auth.errors keys", async () => {
    const { client } = fakeClient({
      code: "INVALID_EMAIL_OR_PASSWORD",
      status: 401,
    });
    expect(
      await createFlowActions(client, OPTIONS).signInPassword("a@b.be", "x")
    ).toEqual({ error: "invalidCredentials", ok: false });
  });

  test("social: a redirect on web, a session check on Expo", async () => {
    const { client } = fakeClient();
    expect(
      await createFlowActions(client, OPTIONS).signInSocial("google")
    ).toEqual({ ok: true, redirected: true });

    const expo = (hasSession: boolean) =>
      createFlowActions(client, {
        ...OPTIONS,
        socialFlow: {
          hasSession: () => Promise.resolve(hasSession),
          kind: "session",
        },
      });
    expect(await expo(true).signInSocial("google")).toEqual({ ok: true });
    expect(await expo(false).signInSocial("google")).toEqual({
      error: "socialFailed",
      ok: false,
    });
  });

  test("uses a native provider sign-in when given", async () => {
    const { calls, client } = fakeClient();
    const result = await createFlowActions(client, {
      ...OPTIONS,
      social: { apple: () => Promise.resolve({ ok: true }) },
    }).signInSocial("apple");
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });

  test("passkeys fail cleanly where they are not available", async () => {
    const { client } = fakeClient();
    expect(await createFlowActions(client, OPTIONS).signInPasskey()).toEqual({
      error: "passkeyFailed",
      ok: false,
    });
  });
});
