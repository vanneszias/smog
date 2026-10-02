import type { SocialProvider } from "@smog/auth/react";
import type { TranslationKey } from "@smog/i18n";
import type { SignInMethods } from "../schema";

/** A Better Auth client error (web and Expo alike). */
export interface AuthCallError {
  code?: string | undefined;
  status?: number | undefined;
}

/** What a Better Auth client call resolves to (`{ data, error }`). */
export type AuthCall = Promise<{ error?: AuthCallError | null } | undefined>;

/**
 * Why a sign-in method change failed:
 * - `SIGN_IN_AGAIN`: the session is older than Better Auth's `freshAge`
 *   (unlinking, adding a passkey);
 * - `LAST_METHOD`: Better Auth keeps the last account;
 * - `INVALID_PASSWORD`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`;
 * - `RATE_LIMITED`, or `UNKNOWN`.
 */
export type AccountActionError =
  | "INVALID_PASSWORD"
  | "LAST_METHOD"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_TOO_SHORT"
  | "RATE_LIMITED"
  | "SIGN_IN_AGAIN"
  | "UNKNOWN";

export type AccountActionResult =
  | { ok: true }
  | { error: AccountActionError; ok: false };

const CODES: Record<string, AccountActionError> = {
  FAILED_TO_UNLINK_LAST_ACCOUNT: "LAST_METHOD",
  INVALID_PASSWORD: "INVALID_PASSWORD",
  PASSWORD_TOO_LONG: "PASSWORD_TOO_LONG",
  PASSWORD_TOO_SHORT: "PASSWORD_TOO_SHORT",
  SESSION_EXPIRED: "SIGN_IN_AGAIN",
  SESSION_NOT_FRESH: "SIGN_IN_AGAIN",
};

const MESSAGES = {
  INVALID_PASSWORD: "account.errors.invalidPassword",
  LAST_METHOD: "account.methods.lastMethod",
  PASSWORD_TOO_LONG: "auth.errors.passwordTooLong",
  PASSWORD_TOO_SHORT: "auth.errors.passwordTooShort",
  RATE_LIMITED: "auth.errors.rateLimited",
  SIGN_IN_AGAIN: "account.errors.signInAgain",
  UNKNOWN: "auth.errors.generic",
} as const satisfies Record<AccountActionError, TranslationKey>;

/**
 * The `@smog/i18n` key that explains `error` (both apps show the same
 * words). The password ones take `{ min, max }`.
 */
export function accountActionMessage(
  error: AccountActionError
): (typeof MESSAGES)[AccountActionError] {
  return MESSAGES[error];
}

/** Maps a Better Auth error (code, status) to an `AccountActionError`. */
export function accountActionError(
  error: AuthCallError | null | undefined
): AccountActionError {
  if (error?.status === 429) {
    return "RATE_LIMITED";
  }
  return (error?.code && CODES[error.code]) || "UNKNOWN";
}

/**
 * The Better Auth accounts a user has (a credential with a password, Google,
 * Apple). Passkeys are no account, and the email code and link need none.
 */
export function linkedAccountCount(methods: SignInMethods): number {
  return [methods.password, methods.google, methods.apple].filter(Boolean)
    .length;
}

/**
 * Whether `provider` can be unlinked: it is linked and another account
 * stays. Better Auth refuses to remove the last one (`LAST_METHOD`); the
 * screens disable the button instead of letting it fail.
 */
export function canUnlink(
  methods: SignInMethods,
  provider: SocialProvider
): boolean {
  return methods[provider] && linkedAccountCount(methods) > 1;
}

/** Turns a Better Auth response into an `AccountActionResult`, logging a failure. */
export function toActionResult(
  response: { error?: AuthCallError | null } | undefined,
  what: string
): AccountActionResult {
  if (response?.error) {
    console.error(`[account] Failed to ${what}:`, response.error);
    return { error: accountActionError(response.error), ok: false };
  }
  return { ok: true };
}

/** A thrown call (offline) as an `UNKNOWN` result, logged. */
export function thrownResult(
  error: unknown,
  what: string
): AccountActionResult {
  console.error(`[account] Failed to ${what}:`, error);
  return { error: "UNKNOWN", ok: false };
}
