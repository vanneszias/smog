import { useMemo, useReducer, useRef } from "react";
import { OTP_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./fields";

/**
 * The sign-in / sign-up / forgot-password flow as a platform-neutral state
 * machine (spec §16 flow 3): email first, then the method choice, then the
 * password, code or inbox step, then done. Both apps render it with their
 * own kit; the platform calls are injected as `AuthFlowActions`.
 */

export type AuthMode = "signIn" | "signUp" | "forgotPassword";

export type AuthMethod =
  | "password"
  | "emailCode"
  | "magicLink"
  | "google"
  | "apple"
  | "passkey";

export type AuthStep =
  | "email"
  | "method"
  | "password"
  | "code"
  | "magicLinkSent"
  | "verifyEmailSent"
  | "resetSent"
  | "done";

/** A key under `auth.errors.*` in `@smog/i18n`. */
export type AuthErrorKey =
  | "emailRequired"
  | "emailInvalid"
  | "nameRequired"
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "invalidCredentials"
  | "emailNotVerified"
  | "userExists"
  | "codeRequired"
  | "codeInvalid"
  | "linkInvalid"
  | "rateLimited"
  | "captchaFailed"
  | "socialFailed"
  | "passkeyFailed"
  | "generic";

export type AuthNotice = "codeResent" | "linkResent" | "verificationResent";

/** What is in flight: the email step's request, or a method's. */
type AuthPending = AuthMethod | "email" | "resend";

export interface AuthFlowState {
  email: string;
  error: AuthErrorKey | null;
  mode: AuthMode;
  notice: AuthNotice | null;
  pending: AuthPending | null;
  step: AuthStep;
}

export type AuthFlowEvent =
  | { email: string; type: "emailAccepted" }
  | { method: "password"; type: "choose" }
  | { action: AuthPending; type: "started" }
  | { error: AuthErrorKey; type: "failed" }
  | { step: AuthStep; type: "succeeded"; notice?: AuthNotice }
  | { type: "redirecting" }
  | { type: "cancelled" }
  | { type: "back" }
  | { type: "changeEmail" };

/**
 * An action's outcome. `redirected` means the page is navigating away (a
 * browser OAuth flow), so the flow keeps showing the pending state.
 */
export type AuthResult =
  | { ok: true; redirected?: boolean }
  | { error: AuthErrorKey; ok: false };

export type SocialProvider = "google" | "apple";

/**
 * The platform's auth calls (web or Expo client), with errors mapped. The
 * captcha-guarded ones take the Turnstile token the flow asked for
 * (`AuthFlowCaptcha`); without one they use the platform's own widget.
 */
export interface AuthFlowActions {
  requestPasswordReset: (
    email: string,
    captchaToken?: string
  ) => Promise<AuthResult>;
  sendCode: (email: string, captchaToken?: string) => Promise<AuthResult>;
  sendMagicLink: (email: string, captchaToken?: string) => Promise<AuthResult>;
  sendVerificationEmail: (
    email: string,
    captchaToken?: string
  ) => Promise<AuthResult>;
  signInCode: (email: string, code: string) => Promise<AuthResult>;
  signInPasskey: () => Promise<AuthResult>;
  signInPassword: (
    email: string,
    password: string,
    captchaToken?: string
  ) => Promise<AuthResult>;
  signInSocial: (provider: SocialProvider) => Promise<AuthResult>;
  signUpPassword: (
    email: string,
    password: string,
    name: string,
    captchaToken?: string
  ) => Promise<AuthResult>;
}

/**
 * A Turnstile challenge on demand (the app's WebView sheet). When the
 * server requires a captcha (`required()`: a site key is configured), the
 * flow asks `request()` for a fresh token before every guarded call; tokens
 * are single-use, so none is kept. `null` means the user closed the
 * challenge.
 */
export interface AuthFlowCaptcha {
  request: () => Promise<string | null>;
  required: () => boolean;
}

export function initialAuthFlowState(
  mode: AuthMode,
  email = ""
): AuthFlowState {
  return {
    email,
    error: null,
    mode,
    notice: null,
    pending: null,
    step: "email",
  };
}

const BACK: Partial<Record<AuthStep, AuthStep>> = {
  code: "method",
  magicLinkSent: "method",
  method: "email",
  password: "method",
  resetSent: "email",
  verifyEmailSent: "email",
};

export function authFlowReducer(
  state: AuthFlowState,
  event: AuthFlowEvent
): AuthFlowState {
  switch (event.type) {
    case "emailAccepted":
      return {
        ...state,
        email: event.email,
        error: null,
        notice: null,
        step: state.mode === "forgotPassword" ? state.step : "method",
      };
    case "choose":
      return { ...state, error: null, notice: null, step: "password" };
    case "started":
      if (state.pending) {
        return state;
      }
      return { ...state, error: null, notice: null, pending: event.action };
    case "failed":
      return { ...state, error: event.error, pending: null };
    case "succeeded":
      return {
        ...state,
        error: null,
        notice: event.notice ?? null,
        pending: null,
        step: event.step,
      };
    case "redirecting":
      return state;
    case "cancelled":
      return { ...state, pending: null };
    case "back":
      return {
        ...state,
        error: null,
        notice: null,
        pending: null,
        step: BACK[state.step] ?? state.step,
      };
    case "changeEmail":
      return {
        ...state,
        error: null,
        notice: null,
        pending: null,
        step: "email",
      };
    default:
      return state;
  }
}

/** The shape of a Better Auth client error (`{ error }` of every call). */
export interface AuthClientError {
  code?: string | undefined;
  status?: number | undefined;
}

const ERROR_CODES: Record<string, AuthErrorKey> = {
  EMAIL_NOT_VERIFIED: "emailNotVerified",
  INVALID_EMAIL: "emailInvalid",
  INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
  INVALID_OTP: "codeInvalid",
  INVALID_TOKEN: "linkInvalid",
  MISSING_RESPONSE: "captchaFailed",
  OTP_EXPIRED: "codeInvalid",
  PASSWORD_TOO_LONG: "passwordTooLong",
  PASSWORD_TOO_SHORT: "passwordTooShort",
  TOO_MANY_ATTEMPTS: "rateLimited",
  USER_ALREADY_EXISTS: "userExists",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "userExists",
  VERIFICATION_FAILED: "captchaFailed",
};

/** Maps a Better Auth error (code, status) to an `auth.errors.*` key. */
export function authErrorKey(
  error: AuthClientError | null | undefined
): AuthErrorKey {
  if (error?.status === 429) {
    return "rateLimited";
  }
  return (error?.code && ERROR_CODES[error.code]) || "generic";
}

/** The input an error is about; the rest are step-level messages. */
export type AuthErrorField = "email" | "name" | "password" | "confirm" | "code";

const ERROR_FIELDS: Partial<Record<AuthErrorKey, AuthErrorField>> = {
  codeInvalid: "code",
  codeRequired: "code",
  emailInvalid: "email",
  emailRequired: "email",
  invalidCredentials: "password",
  nameRequired: "name",
  passwordMismatch: "confirm",
  passwordRequired: "password",
  passwordTooLong: "password",
  passwordTooShort: "password",
};

/**
 * Which input shows `error` (so it is wired with `aria-invalid` and
 * `aria-describedby`), or `null` for a message about the whole step.
 */
export function authErrorField(
  error: AuthErrorKey | null
): AuthErrorField | null {
  return error ? (ERROR_FIELDS[error] ?? null) : null;
}

/** Turns a Better Auth `{ error }` response into an `AuthResult`. */
export function toAuthResult(response: {
  error?: AuthClientError | null;
}): AuthResult {
  return response.error
    ? { error: authErrorKey(response.error), ok: false }
    : { ok: true };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHITESPACE = /\s+/g;
const DIGITS = new RegExp(`^\\d{${OTP_LENGTH}}$`);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailError(email: string): AuthErrorKey | null {
  if (email === "") {
    return "emailRequired";
  }
  return EMAIL_PATTERN.test(email) ? null : "emailInvalid";
}

export interface PasswordInput {
  /** The repeat (sign-up and reset). */
  confirm?: string;
  /** The display name (sign-up). */
  name?: string;
  password: string;
}

/** Checks a new password (sign-up and reset) and its repeat. */
export function newPasswordError(input: PasswordInput): AuthErrorKey | null {
  if (input.password === "") {
    return "passwordRequired";
  }
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    return "passwordTooShort";
  }
  if (input.password.length > PASSWORD_MAX_LENGTH) {
    return "passwordTooLong";
  }
  return input.password === input.confirm ? null : "passwordMismatch";
}

function signUpError(input: PasswordInput): AuthErrorKey | null {
  if (!input.name?.trim()) {
    return "nameRequired";
  }
  return newPasswordError(input);
}

export interface AuthFlowCommands {
  back: () => void;
  changeEmail: () => void;
  choose: (method: AuthMethod) => Promise<void>;
  resend: () => Promise<void>;
  submitCode: (code: string) => Promise<void>;
  submitEmail: (email: string) => Promise<void>;
  submitPassword: (input: PasswordInput) => Promise<void>;
}

interface CommandOptions {
  actions: AuthFlowActions;
  captcha?: AuthFlowCaptcha;
  dispatch: (event: AuthFlowEvent) => void;
  getState: () => AuthFlowState;
}

/**
 * The flow's commands: validate, dispatch `started`, run the action and
 * dispatch the outcome. Kept outside React so the machine is tested with
 * plain calls; `useAuthFlow` binds it to a reducer.
 */
export function authFlowCommands({
  actions,
  captcha,
  dispatch,
  getState,
}: CommandOptions): AuthFlowCommands {
  /**
   * The token for a guarded call: `undefined` when the server requires
   * none (or the platform's widget supplies it), `null` when the user
   * closed the challenge.
   */
  async function captchaToken(): Promise<string | null | undefined> {
    if (!captcha?.required()) {
      return undefined;
    }
    return await captcha.request();
  }

  async function run(
    action: AuthPending,
    call: (token?: string) => Promise<AuthResult>,
    onSuccess: AuthFlowEvent & { type: "succeeded" },
    guarded = false
  ): Promise<void> {
    if (getState().pending) {
      return;
    }
    dispatch({ action, type: "started" });
    let token: string | undefined;
    if (guarded) {
      let answer: string | null | undefined;
      try {
        answer = await captchaToken();
      } catch (error) {
        console.error(`[auth] Failed to run the captcha for ${action}:`, error);
        dispatch({ error: "captchaFailed", type: "failed" });
        return;
      }
      if (answer === null) {
        dispatch({ type: "cancelled" });
        return;
      }
      token = answer;
    }
    let result: AuthResult;
    try {
      result = await call(token);
    } catch (error) {
      console.error(`[auth] Failed to run ${action}:`, error);
      result = { error: "generic", ok: false };
    }
    if (!result.ok) {
      dispatch({ error: result.error, type: "failed" });
    } else if (result.redirected) {
      dispatch({ type: "redirecting" });
    } else {
      dispatch(onSuccess);
    }
  }

  const fail = (error: AuthErrorKey): void => {
    dispatch({ error, type: "failed" });
  };

  return {
    back: () => dispatch({ type: "back" }),
    changeEmail: () => dispatch({ type: "changeEmail" }),

    choose: async (method) => {
      const { email } = getState();
      switch (method) {
        case "password":
          dispatch({ method, type: "choose" });
          return;
        case "emailCode":
          await run(
            method,
            (token) => actions.sendCode(email, token),
            { step: "code", type: "succeeded" },
            true
          );
          return;
        case "magicLink":
          await run(
            method,
            (token) => actions.sendMagicLink(email, token),
            { step: "magicLinkSent", type: "succeeded" },
            true
          );
          return;
        case "passkey":
          await run(method, () => actions.signInPasskey(), {
            step: "done",
            type: "succeeded",
          });
          return;
        default:
          await run(method, () => actions.signInSocial(method), {
            step: "done",
            type: "succeeded",
          });
      }
    },

    resend: async () => {
      const { email, step } = getState();
      if (step === "code") {
        await run(
          "resend",
          (token) => actions.sendCode(email, token),
          { notice: "codeResent", step, type: "succeeded" },
          true
        );
      } else if (step === "magicLinkSent") {
        await run(
          "resend",
          (token) => actions.sendMagicLink(email, token),
          { notice: "linkResent", step, type: "succeeded" },
          true
        );
      } else if (step === "verifyEmailSent") {
        await run(
          "resend",
          (token) => actions.sendVerificationEmail(email, token),
          { notice: "verificationResent", step, type: "succeeded" },
          true
        );
      }
    },

    submitCode: async (raw) => {
      const code = raw.replace(WHITESPACE, "");
      if (code === "") {
        fail("codeRequired");
        return;
      }
      if (!DIGITS.test(code)) {
        fail("codeInvalid");
        return;
      }
      const { email } = getState();
      await run("emailCode", () => actions.signInCode(email, code), {
        step: "done",
        type: "succeeded",
      });
    },

    submitEmail: async (raw) => {
      const email = normalizeEmail(raw);
      const error = emailError(email);
      if (error) {
        fail(error);
        return;
      }
      dispatch({ email, type: "emailAccepted" });
      if (getState().mode === "forgotPassword") {
        await run(
          "email",
          (token) => actions.requestPasswordReset(email, token),
          { step: "resetSent", type: "succeeded" },
          true
        );
      }
    },

    submitPassword: async (input) => {
      const { email, mode } = getState();
      if (mode === "signUp") {
        const error = signUpError(input);
        if (error) {
          fail(error);
          return;
        }
        const name = input.name?.trim() ?? "";
        await run(
          "password",
          (token) => actions.signUpPassword(email, input.password, name, token),
          { step: "verifyEmailSent", type: "succeeded" },
          true
        );
        return;
      }
      if (input.password === "") {
        fail("passwordRequired");
        return;
      }
      await run(
        "password",
        (token) => actions.signInPassword(email, input.password, token),
        { step: "done", type: "succeeded" },
        true
      );
    },
  };
}

export interface AuthFlow extends AuthFlowCommands {
  state: AuthFlowState;
}

/**
 * The auth flow for a screen: `state` to render and the commands to call.
 * `actions` may change between renders (a new captcha token); the latest
 * one is always used.
 */
export function useAuthFlow({
  actions,
  initialEmail,
  mode,
  requestCaptcha,
  requiresCaptcha = false,
}: {
  actions: AuthFlowActions;
  initialEmail?: string;
  mode: AuthMode;
  /** Runs a Turnstile challenge and resolves its token (the app's sheet). */
  requestCaptcha?: () => Promise<string | null>;
  /**
   * The server requires a captcha (a site key is configured): the flow
   * asks `requestCaptcha` for a token before each guarded call.
   */
  requiresCaptcha?: boolean;
}): AuthFlow {
  const [state, dispatch] = useReducer(
    authFlowReducer,
    initialAuthFlowState(mode, initialEmail)
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const captchaRef = useRef({ request: requestCaptcha, requiresCaptcha });
  captchaRef.current = { request: requestCaptcha, requiresCaptcha };

  const commands = useMemo(() => {
    const latest: AuthFlowActions = {
      requestPasswordReset: (email, token) =>
        actionsRef.current.requestPasswordReset(email, token),
      sendCode: (email, token) => actionsRef.current.sendCode(email, token),
      sendMagicLink: (email, token) =>
        actionsRef.current.sendMagicLink(email, token),
      sendVerificationEmail: (email, token) =>
        actionsRef.current.sendVerificationEmail(email, token),
      signInCode: (email, code) => actionsRef.current.signInCode(email, code),
      signInPasskey: () => actionsRef.current.signInPasskey(),
      signInPassword: (email, password, token) =>
        actionsRef.current.signInPassword(email, password, token),
      signInSocial: (provider) => actionsRef.current.signInSocial(provider),
      signUpPassword: (email, password, name, token) =>
        actionsRef.current.signUpPassword(email, password, name, token),
    };
    return authFlowCommands({
      actions: latest,
      captcha: {
        request: async () => {
          const { request } = captchaRef.current;
          if (!request) {
            throw new Error("requiresCaptcha without requestCaptcha");
          }
          return await request();
        },
        required: () => captchaRef.current.requiresCaptcha,
      },
      // The ref follows every dispatch, so a command reads the state it
      // just produced (validation → request in one call).
      dispatch: (event) => {
        stateRef.current = authFlowReducer(stateRef.current, event);
        dispatch(event);
      },
      getState: () => stateRef.current,
    });
  }, []);

  return { ...commands, state };
}
