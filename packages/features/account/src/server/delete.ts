/**
 * Account deletion (`account.delete`) through Better Auth `deleteUser`
 * (`user.deleteUser.enabled` in `@smog/auth`; its HTTP route is disabled,
 * so this is the only way in). An account with a password must send it
 * (a stolen session alone never deletes it); one without (passkeys,
 * Google, Apple) needs a session younger than `session.freshAge`, which
 * Better Auth checks. Better Auth deletes the sessions, the provider
 * accounts and the user row, and the foreign keys do the rest (spec §5):
 * passkeys, favorites, lists with their items and share links, and
 * consent rows cascade; `audit_log.actor_id`, `list_item.added_by`,
 * `list_share.created_by` and `sponsorship_event.actor_id` become NULL.
 * Sponsor rows have no user reference and stay (retention). The stored
 * dead letters (`dead_letter`, phase 9 ruling 5c) have no user reference
 * either: the ones whose body's `to` is the deleted address are removed by
 * address once the account is gone (`eraseDeadLetters`).
 */
import type { Auth } from "@smog/auth";
import {
  account,
  eraseDeadLettersOf,
  otherActiveAdminExists,
  user,
  userBanInForce,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { DeleteAccountErrorCode } from "../contract";
import type { DeleteAccountResult } from "../schema";

/** A refusal the client acts on (sign in again, or enter the password). */
export class DeleteAccountError extends Error {
  readonly code: DeleteAccountErrorCode | "INVALID_STATE" | "UNAUTHORIZED";

  constructor(
    code: DeleteAccountErrorCode | "INVALID_STATE" | "UNAUTHORIZED",
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

/** Whether the user has a credential account with a password. */
async function hasPassword(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password)
      )
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Whether `userId` is an admin without a ban in force and no other such
 * admin exists: deleting it would leave the site without an admin
 * (ruling 7; demotions are guarded by migration 0007's trigger).
 */
async function isLastAdmin(db: Db, userId: string): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.id, userId),
        eq(user.role, "admin"),
        sql`NOT ${userBanInForce(now)}`,
        sql`NOT ${otherActiveAdminExists(userId, now)}`
      )
    )
    .limit(1);
  return row !== undefined;
}

/** The account's address as stored (Better Auth lowercases it), or `null`. */
async function emailOf(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/**
 * Erases the dead letters addressed to `email` (`eraseDeadLettersOf`). A
 * failure is logged and not rethrown: the account is already deleted, and
 * the daily retention removes the row within 14 days anyway.
 */
async function eraseDeadLetters(db: Db, email: string): Promise<void> {
  try {
    await eraseDeadLettersOf(db, email);
  } catch (error) {
    console.error(
      "[account] Failed to erase the dead letters of a deleted account:",
      error
    );
  }
}

export interface DeleteAccountDeps {
  auth: Auth;
  db: Db;
  /** The request's headers: Better Auth reads the session from them again. */
  headers: Headers;
}

/**
 * Deletes `userId`'s account (the signed-in user). Throws
 * `DeleteAccountError` when it is refused (the last admin: `INVALID_STATE`;
 * a password account without the password, a wrong password, a stale
 * session, no session), and
 * rethrows anything else.
 */
export async function deleteAccount(
  deps: DeleteAccountDeps,
  userId: string,
  input: { password?: string | undefined }
): Promise<DeleteAccountResult> {
  try {
    if (await isLastAdmin(deps.db, userId)) {
      throw new DeleteAccountError("INVALID_STATE");
    }
    if (input.password === undefined && (await hasPassword(deps.db, userId))) {
      throw new DeleteAccountError("PASSWORD_REQUIRED");
    }
    const email = await emailOf(deps.db, userId);
    await deps.auth.api.deleteUser({
      body: input.password === undefined ? {} : { password: input.password },
      headers: deps.headers,
    });
    if (email !== null) {
      await eraseDeadLetters(deps.db, email);
    }
    return { deleted: true };
  } catch (error) {
    if (error instanceof DeleteAccountError) {
      throw error;
    }
    const code = betterAuthCode(error);
    const refusal = code === undefined ? undefined : REFUSALS[code];
    if (refusal) {
      throw new DeleteAccountError(refusal, { cause: error });
    }
    console.error("[account] Failed to delete the account:", error);
    throw error;
  }
}
