/**
 * `@smog/account/contract`: the signed-in user's account (spec §5.3, §6,
 * §11). Mounted as `account` in `@smog/api`'s `appContract`. Every
 * procedure needs a session (`UNAUTHORIZED`).
 */
import { baseContract } from "@smog/rpc/contract";
import {
  accountExportSchema,
  consentStateSchema,
  deleteAccountInputSchema,
  deleteAccountResultSchema,
  importGuestDataInputSchema,
  importResultSchema,
  meSchema,
  setConsentInputSchema,
  updateProfileInputSchema,
} from "./schema";

/**
 * The errors `account.delete` adds to the shared map. Clients show
 * `account.errors.<code>` copy: sign in again, or enter the password.
 */
export const DELETE_ACCOUNT_ERRORS = {
  /** The password is wrong, or the account has none to check. */
  INVALID_PASSWORD: { status: 400 },
  /** The session is older than `freshAge` and no password was sent. */
  SESSION_NOT_FRESH: { status: 403 },
} as const;

export const accountContract = {
  consent: {
    /** The current analytics decision (the newest consent log row). */
    get: baseContract.output(consentStateSchema),
    /**
     * Appends an analytics decision to the consent log (policy version
     * `CONSENT_POLICY_VERSION`) and returns the new state.
     */
    set: baseContract.input(setConsentInputSchema).output(consentStateSchema),
  },
  /**
   * Deletes the account through Better Auth `deleteUser`: it needs a fresh
   * session (`freshAge`) or the password. Every session ends and the data
   * cascades (spec §5); sponsorship records stay (they are the sponsor's).
   * The client then signs out and clears the local store.
   */
  delete: baseContract
    .errors(DELETE_ACCOUNT_ERRORS)
    .input(deleteAccountInputSchema)
    .output(deleteAccountResultSchema),
  /** Everything stored about the user, as a versioned JSON document. */
  export: baseContract.output(accountExportSchema),
  /**
   * Merges a guest's on-device favorites, lists and consent choice into the
   * account. Favorites become a union; a list is created, or its missing items are appended to the user's
   * same-name list (case-insensitive, trimmed); unknown and unpublished
   * gestures are skipped and counted; the consent choice is appended to
   * the consent log with source `import`. All or nothing, and idempotent:
   * a second identical call adds nothing.
   */
  importGuestData: baseContract
    .input(importGuestDataInputSchema)
    .output(importResultSchema),
  /** The profile and the sign-in methods. */
  me: baseContract.output(meSchema),
  /** Changes the name and/or the language; returns the new profile. */
  updateProfile: baseContract.input(updateProfileInputSchema).output(meSchema),
};

export type AccountContract = typeof accountContract;

/** The codes `account.delete` can fail with, besides the shared ones. */
export type DeleteAccountErrorCode = keyof typeof DELETE_ACCOUNT_ERRORS;
