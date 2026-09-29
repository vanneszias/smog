import { describe, expect, test } from "bun:test";
import {
  type AuthFlowActions,
  type AuthFlowEvent,
  type AuthFlowState,
  type AuthResult,
  authErrorField,
  authErrorKey,
  authFlowCommands,
  authFlowReducer,
  initialAuthFlowState,
} from "./use-auth-flow";

const EMAIL = "ada@smog.test";
const OK: AuthResult = { ok: true };

/** A store around the reducer, the way the hook drives it. */
function harness(
  mode: AuthFlowState["mode"],
  overrides: Partial<AuthFlowActions> = {}
) {
  const calls: string[] = [];
  const record =
    (name: string, result: AuthResult = OK) =>
    (...args: unknown[]): Promise<AuthResult> => {
      calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return Promise.resolve(result);
    };
  const actions: AuthFlowActions = {
    requestPasswordReset: record("requestPasswordReset"),
    sendCode: record("sendCode"),
    sendMagicLink: record("sendMagicLink"),
    sendVerificationEmail: record("sendVerificationEmail"),
    signInCode: record("signInCode"),
    signInPasskey: record("signInPasskey"),
    signInPassword: record("signInPassword"),
    signInSocial: record("signInSocial"),
    signUpPassword: record("signUpPassword"),
    ...overrides,
  };
  let state = initialAuthFlowState(mode);
  const events: AuthFlowEvent["type"][] = [];
  const dispatch = (event: AuthFlowEvent): void => {
    events.push(event.type);
    state = authFlowReducer(state, event);
  };
  const commands = authFlowCommands({
    actions,
    dispatch,
    getState: () => state,
  });
  return { calls, commands, events, state: () => state };
}

describe("authFlowReducer", () => {
  test("starts at the email step", () => {
    expect(initialAuthFlowState("signIn")).toEqual({
      email: "",
      error: null,
      mode: "signIn",
      notice: null,
      pending: null,
      step: "email",
    });
  });

  test("goes back from a method step to the choice, then to the email", () => {
    let state = authFlowReducer(initialAuthFlowState("signIn"), {
      email: EMAIL,
      type: "emailAccepted",
    });
    state = authFlowReducer(state, { method: "password", type: "choose" });
    expect(state.step).toBe("password");
    state = authFlowReducer(state, { type: "back" });
    expect(state.step).toBe("method");
    state = authFlowReducer(state, { type: "back" });
    expect(state).toMatchObject({ email: EMAIL, step: "email" });
  });

  test("clears the error and notice when a request starts", () => {
    let state = authFlowReducer(initialAuthFlowState("signIn"), {
      error: "generic",
      type: "failed",
    });
    expect(state.error).toBe("generic");
    state = authFlowReducer(state, { action: "email", type: "started" });
    expect(state).toMatchObject({ error: null, pending: "email" });
  });

  test("ignores a new request while one is pending", () => {
    const state = authFlowReducer(initialAuthFlowState("signIn"), {
      action: "password",
      type: "started",
    });
    expect(
      authFlowReducer(state, { action: "emailCode", type: "started" })
    ).toBe(state);
  });
});

describe("authErrorKey", () => {
  test("maps Better Auth error codes to auth.errors keys", () => {
    expect(
      authErrorKey({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })
    ).toBe("invalidCredentials");
    expect(authErrorKey({ code: "EMAIL_NOT_VERIFIED", status: 403 })).toBe(
      "emailNotVerified"
    );
    expect(
      authErrorKey({
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        status: 422,
      })
    ).toBe("userExists");
    expect(authErrorKey({ code: "INVALID_OTP", status: 400 })).toBe(
      "codeInvalid"
    );
    expect(authErrorKey({ code: "OTP_EXPIRED", status: 400 })).toBe(
      "codeInvalid"
    );
    expect(authErrorKey({ code: "MISSING_RESPONSE", status: 400 })).toBe(
      "captchaFailed"
    );
    expect(authErrorKey({ code: "VERIFICATION_FAILED", status: 403 })).toBe(
      "captchaFailed"
    );
    expect(authErrorKey({ code: "INVALID_TOKEN", status: 400 })).toBe(
      "linkInvalid"
    );
    expect(authErrorKey({ status: 429 })).toBe("rateLimited");
    expect(authErrorKey({ code: "SOMETHING_NEW", status: 500 })).toBe(
      "generic"
    );
    expect(authErrorKey(undefined)).toBe("generic");
  });
});

describe("authErrorField", () => {
  test("names the input an error belongs to, or none for step errors", () => {
    expect(authErrorField("emailInvalid")).toBe("email");
    expect(authErrorField("nameRequired")).toBe("name");
    expect(authErrorField("passwordTooShort")).toBe("password");
    expect(authErrorField("invalidCredentials")).toBe("password");
    expect(authErrorField("passwordMismatch")).toBe("confirm");
    expect(authErrorField("codeInvalid")).toBe("code");
    expect(authErrorField("rateLimited")).toBeNull();
    expect(authErrorField(null)).toBeNull();
  });
});

describe("authFlowCommands: sign in", () => {
  test("rejects an empty or invalid email without calling the server", async () => {
    const flow = harness("signIn");
    await flow.commands.submitEmail("  ");
    expect(flow.state().error).toBe("emailRequired");
    await flow.commands.submitEmail("not-an-email");
    expect(flow.state()).toMatchObject({
      error: "emailInvalid",
      step: "email",
    });
    expect(flow.calls).toEqual([]);
  });

  test("email → method → password → done", async () => {
    const flow = harness("signIn");
    await flow.commands.submitEmail(` ${EMAIL.toUpperCase()} `);
    expect(flow.state()).toMatchObject({ email: EMAIL, step: "method" });

    await flow.commands.choose("password");
    expect(flow.state().step).toBe("password");

    await flow.commands.submitPassword({ password: "" });
    expect(flow.state().error).toBe("passwordRequired");

    await flow.commands.submitPassword({ password: "correct horse" });
    expect(flow.calls).toEqual([`signInPassword("${EMAIL}","correct horse")`]);
    expect(flow.state()).toMatchObject({ pending: null, step: "done" });
  });

  test("shows the server error and stays on the step", async () => {
    const flow = harness("signIn", {
      signInPassword: () =>
        Promise.resolve({ error: "invalidCredentials", ok: false }),
    });
    await flow.commands.submitEmail(EMAIL);
    await flow.commands.choose("password");
    await flow.commands.submitPassword({ password: "wrong password" });
    expect(flow.state()).toMatchObject({
      error: "invalidCredentials",
      pending: null,
      step: "password",
    });
  });

  test("email code: sends the code, then signs in with 6 digits", async () => {
    const flow = harness("signIn");
    await flow.commands.submitEmail(EMAIL);
    await flow.commands.choose("emailCode");
    expect(flow.state().step).toBe("code");
    expect(flow.calls).toEqual([`sendCode("${EMAIL}")`]);

    await flow.commands.submitCode("12 34");
    expect(flow.state().error).toBe("codeInvalid");
    await flow.commands.submitCode("");
    expect(flow.state().error).toBe("codeRequired");

    await flow.commands.submitCode(" 123 456 ");
    expect(flow.calls.at(-1)).toBe(`signInCode("${EMAIL}","123456")`);
    expect(flow.state().step).toBe("done");
  });

  test("resends a code and shows a notice", async () => {
    const flow = harness("signIn");
    await flow.commands.submitEmail(EMAIL);
    await flow.commands.choose("emailCode");
    await flow.commands.resend();
    expect(flow.calls).toEqual([
      `sendCode("${EMAIL}")`,
      `sendCode("${EMAIL}")`,
    ]);
    expect(flow.state()).toMatchObject({ notice: "codeResent", step: "code" });
  });

  test("magic link: sends the link and waits for the inbox", async () => {
    const flow = harness("signIn");
    await flow.commands.submitEmail(EMAIL);
    await flow.commands.choose("magicLink");
    expect(flow.state().step).toBe("magicLinkSent");
    await flow.commands.resend();
    expect(flow.calls).toEqual([
      `sendMagicLink("${EMAIL}")`,
      `sendMagicLink("${EMAIL}")`,
    ]);
    expect(flow.state().notice).toBe("linkResent");
  });

  test("social and passkey sign-in go through the actions", async () => {
    const flow = harness("signIn");
    await flow.commands.submitEmail(EMAIL);
    await flow.commands.choose("google");
    await flow.commands.choose("apple");
    await flow.commands.choose("passkey");
    expect(flow.calls).toEqual([
      'signInSocial("google")',
      'signInSocial("apple")',
      "signInPasskey()",
    ]);
    expect(flow.state().step).toBe("done");
  });

  test("a social redirect keeps the step (the page navigates away)", async () => {
    const flow = harness("signIn", {
      signInSocial: () => Promise.resolve({ ok: true, redirected: true }),
    });
    await flow.commands.submitEmail(EMAIL);
    await flow.commands.choose("google");
    expect(flow.state()).toMatchObject({ pending: "google", step: "method" });
  });

  test("a thrown action becomes the generic error", async () => {
    const flow = harness("signIn", {
      sendCode: () => Promise.reject(new Error("offline")),
    });
    await flow.commands.submitEmail(EMAIL);
    await flow.commands.choose("emailCode");
    expect(flow.state()).toMatchObject({
      error: "generic",
      pending: null,
      step: "method",
    });
  });
});

describe("authFlowCommands: sign up", () => {
  test("checks name, length and the repeat before signing up", async () => {
    const flow = harness("signUp");
    await flow.commands.submitEmail(EMAIL);
    await flow.commands.choose("password");

    await flow.commands.submitPassword({
      confirm: "long enough",
      name: " ",
      password: "long enough",
    });
    expect(flow.state().error).toBe("nameRequired");
    await flow.commands.submitPassword({
      confirm: "short",
      name: "Ada",
      password: "short",
    });
    expect(flow.state().error).toBe("passwordTooShort");
    await flow.commands.submitPassword({
      confirm: "x".repeat(129),
      name: "Ada",
      password: "x".repeat(129),
    });
    expect(flow.state().error).toBe("passwordTooLong");
    await flow.commands.submitPassword({
      confirm: "long enougH",
      name: "Ada",
      password: "long enough",
    });
    expect(flow.state().error).toBe("passwordMismatch");
    expect(flow.calls).toEqual([]);

    await flow.commands.submitPassword({
      confirm: "long enough",
      name: " Ada ",
      password: "long enough",
    });
    expect(flow.calls).toEqual([
      `signUpPassword("${EMAIL}","long enough","Ada")`,
    ]);
    expect(flow.state().step).toBe("verifyEmailSent");

    await flow.commands.resend();
    expect(flow.calls.at(-1)).toBe(`sendVerificationEmail("${EMAIL}")`);
    expect(flow.state().notice).toBe("verificationResent");
  });
});

describe("authFlowCommands: forgot password", () => {
  test("sends the reset link from the email step", async () => {
    const flow = harness("forgotPassword");
    await flow.commands.submitEmail(EMAIL);
    expect(flow.calls).toEqual([`requestPasswordReset("${EMAIL}")`]);
    expect(flow.state()).toMatchObject({ email: EMAIL, step: "resetSent" });
  });

  test("goes back to the email step to use another address", async () => {
    const flow = harness("forgotPassword");
    await flow.commands.submitEmail(EMAIL);
    flow.commands.changeEmail();
    expect(flow.state()).toMatchObject({ email: EMAIL, step: "email" });
  });
});
