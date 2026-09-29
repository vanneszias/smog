/**
 * Account deletion (`account.delete`) through Better Auth `deleteUser`
 * (`user.deleteUser.enabled` in `@smog/auth`). Better Auth checks the
 * session is fresh (`session.freshAge`) unless the password is sent and
 * right, deletes the sessions, the provider accounts and the user row,
 * and the foreign keys do the rest (spec §5): passkeys, favorites, lists
 * with their items and share links, and consent rows cascade;
 * `audit_log.actor_id`, `list_item.added_by`, `list_share.created_by` and
 * `sponsorship_event.actor_id` become NULL. Sponsor rows have no user
 * reference and stay (retention). Nothing runs before or after it.
 */
import type { Auth } from "@smog/auth";
import type { DeleteAccountErrorCode } from "../contract";
import type { DeleteAccountResult } from "../schema";

/** A refusal the client acts on (sign in again, or enter the password). */
export class DeleteAccountError extends Error {
  readonly code: DeleteAccountErrorCode | "UNAUTHORIZED";

  constructor(
    code: DeleteAccountErrorCode | "UNAUTHORIZED",
    options?: { cause: unknown }
  ) {
    super(`[account] Account deletion refused: ${code}`, options);
    this.code = code;
    this.name = "DeleteAccountError";
  }
}

/** Better Auth's error codes (`APIError.body.code`) and what they mean here. */
const REFUSALS: Record<string, DeleteAccountError["code"]> = {
  CREDENTIAL_ACCOUNT_NOT_FOUND: "INVALID_PASSWORD",
  INVALID_PASSWORD: "INVALID_PASSWORD",
  PASSWORD_TOO_LONG: "INVALID_PASSWORD",
  SESSION_EXPIRED: "SESSION_NOT_FRESH",
  UNAUTHORIZED: "UNAUTHORIZED",
};

function betterAuthCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("body" in error)) {
    return;
  }
  const { body } = error as { body: unknown };
  if (typeof body === "object" && body !== null && "code" in body) {
    const { code } = body as { code: unknown };
    return typeof code === "string" ? code : undefined;
  }
}

export interface DeleteAccountDeps {
  auth: Auth;
  /** The request's headers: Better Auth reads the session from them again. */
  headers: Headers;
}

/**
 * Deletes the signed-in user's account. Throws `DeleteAccountError` when
 * Better Auth refuses (a stale session without the password, a wrong
 * password, no session), and rethrows anything else.
 */
export async function deleteAccount(
  deps: DeleteAccountDeps,
  input: { password?: string | undefined }
): Promise<DeleteAccountResult> {
  try {
    await deps.auth.api.deleteUser({
      body: input.password === undefined ? {} : { password: input.password },
      headers: deps.headers,
    });
    return { deleted: true };
  } catch (error) {
    const code = betterAuthCode(error);
    const refusal = code === undefined ? undefined : REFUSALS[code];
    if (refusal) {
      throw new DeleteAccountError(refusal, { cause: error });
    }
    console.error("[account] Failed to delete the account:", error);
    throw error;
  }
}
