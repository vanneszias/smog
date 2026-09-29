import {
  type AuthClientError,
  type AuthFlowActions,
  type AuthResult,
  type SocialProvider,
  toAuthResult,
} from "./use-auth-flow";

/** The Turnstile token header Better Auth's captcha plugin reads. */
export const CAPTCHA_HEADER = "x-captcha-response";

type Response = Promise<{ error?: AuthClientError | null }>;
interface FetchOptions {
  fetchOptions?: { headers?: Record<string, string> };
}

/**
 * The calls the flow needs, as both Better Auth clients (web and Expo)
 * expose them. Structural, so this module imports neither client.
 */
export interface FlowAuthClient {
  emailOtp: {
    sendVerificationOtp: (
      body: { email: string; type: "sign-in" } & FetchOptions
    ) => Response;
  };
  requestPasswordReset: (
    body: { email: string; redirectTo: string } & FetchOptions
  ) => Response;
  sendVerificationEmail: (
    body: { callbackURL: string; email: string } & FetchOptions
  ) => Response;
  signIn: {
    email: (
      body: {
        callbackURL: string;
        email: string;
        password: string;
      } & FetchOptions
    ) => Response;
    emailOtp: (body: { email: string; otp: string }) => Response;
    magicLink: (
      body: {
        callbackURL: string;
        email: string;
        errorCallbackURL: string;
        newUserCallbackURL: string;
      } & FetchOptions
    ) => Response;
    social: (body: {
      callbackURL: string;
      errorCallbackURL: string;
      provider: SocialProvider;
    }) => Response;
  };
  signUp: {
    email: (
      body: {
        callbackURL: string;
        email: string;
        name: string;
        password: string;
      } & FetchOptions
    ) => Response;
  };
}

export interface FlowActionOptions {
  /** Where a finished sign-in lands (a path; Expo turns it into `smog://`). */
  callbackURL: string;
  /** The current Turnstile token, when a widget is shown. */
  captchaToken?: () => string | null | undefined;
  /** Where a failed magic link lands (`?error=` is appended). */
  errorCallbackURL: string;
  /** Called after a request used the token (reset the widget). */
  onCaptchaUsed?: () => void;
  /** Passkey sign-in (web only); missing means "not available". */
  passkey?: () => Response;
  /** Where the reset link lands (`/reset-password`). */
  resetPasswordURL: string;
  /** A native provider sign-in (Apple on iOS) instead of the browser flow. */
  social?: Partial<Record<SocialProvider, () => Promise<AuthResult>>>;
  /** Where a failed social sign-in lands (`?error=` is appended). */
  socialErrorCallbackURL: string;
  /**
   * `redirect` (web): the page navigates to the provider, so the flow keeps
   * its pending state. `session` (Expo): the call returns once the auth
   * session closed; it succeeded when `hasSession()` says so afterwards.
   */
  socialFlow:
    | { kind: "redirect" }
    | { hasSession: () => Promise<boolean>; kind: "session" };
  /** Where the verification link lands after signing in (`/verify-email`). */
  verifyEmailURL: string;
}

/**
 * Binds the flow's actions to a Better Auth client: every request that the
 * captcha plugin guards carries the current Turnstile token, and each
 * response becomes an `AuthResult` (error code → `auth.errors.*` key).
 */
export function createFlowActions(
  client: FlowAuthClient,
  options: FlowActionOptions
): AuthFlowActions {
  /**
   * A call the captcha plugin guards: it carries the current token, and
   * `onCaptchaUsed` runs afterwards (tokens are single-use).
   */
  const guarded = async (
    call: (captcha: FetchOptions) => Response
  ): Promise<AuthResult> => {
    const token = options.captchaToken?.();
    try {
      return toAuthResult(
        await call(
          token
            ? { fetchOptions: { headers: { [CAPTCHA_HEADER]: token } } }
            : {}
        )
      );
    } finally {
      if (token) {
        options.onCaptchaUsed?.();
      }
    }
  };
  const { callbackURL, errorCallbackURL } = options;
  return {
    requestPasswordReset: (email) =>
      guarded((captcha) =>
        client.requestPasswordReset({
          email,
          redirectTo: options.resetPasswordURL,
          ...captcha,
        })
      ),
    sendCode: (email) =>
      guarded((captcha) =>
        client.emailOtp.sendVerificationOtp({
          email,
          type: "sign-in",
          ...captcha,
        })
      ),
    sendMagicLink: (email) =>
      guarded((captcha) =>
        client.signIn.magicLink({
          callbackURL,
          email,
          errorCallbackURL,
          newUserCallbackURL: callbackURL,
          ...captcha,
        })
      ),
    sendVerificationEmail: (email) =>
      guarded((captcha) =>
        client.sendVerificationEmail({
          callbackURL: options.verifyEmailURL,
          email,
          ...captcha,
        })
      ),
    signInCode: async (email, otp) =>
      toAuthResult(await client.signIn.emailOtp({ email, otp })),
    signInPasskey: async () => {
      if (!options.passkey) {
        return { error: "passkeyFailed", ok: false };
      }
      const result = toAuthResult(await options.passkey());
      return result.ok ? result : { error: "passkeyFailed", ok: false };
    },
    signInPassword: (email, password) =>
      guarded((captcha) =>
        client.signIn.email({ callbackURL, email, password, ...captcha })
      ),
    signInSocial: async (provider) => {
      const native = options.social?.[provider];
      if (native) {
        return await native();
      }
      const response = await client.signIn.social({
        callbackURL,
        errorCallbackURL: options.socialErrorCallbackURL,
        provider,
      });
      if (response.error) {
        return { error: "socialFailed", ok: false };
      }
      if (options.socialFlow.kind === "redirect") {
        return { ok: true, redirected: true };
      }
      // A closed or cancelled auth session leaves no session behind.
      return (await options.socialFlow.hasSession())
        ? { ok: true }
        : { error: "socialFailed", ok: false };
    },
    signUpPassword: (email, password, name) =>
      guarded((captcha) =>
        client.signUp.email({
          callbackURL: options.verifyEmailURL,
          email,
          name,
          password,
          ...captcha,
        })
      ),
  };
}
