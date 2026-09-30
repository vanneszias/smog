import { ORPCError } from "@orpc/client";
import { useAuthState } from "@smog/auth/react";
import type { TranslationKey } from "@smog/i18n";
import { useLocalStoreInstance } from "@smog/local-store/react";
import { useRpcClient } from "@smog/rpc/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { DeleteAccountInput } from "../schema";
import type { AccountSlice } from "./import-guest-data";

export type DeleteAccountStatus = "idle" | "deleting" | "deleted" | "error";

/**
 * Why a deletion failed: `PASSWORD_REQUIRED` (the account has a password:
 * ask for it), `INVALID_PASSWORD`, `SESSION_NOT_FRESH` (no password: sign
 * in again), `RATE_LIMITED`, or `UNKNOWN`.
 */
export type DeleteAccountFailure =
  | "INVALID_PASSWORD"
  | "PASSWORD_REQUIRED"
  | "RATE_LIMITED"
  | "SESSION_NOT_FRESH"
  | "UNKNOWN";

export interface DeleteAccount {
  /**
   * Deletes the account; then signs out, clears the local store and the
   * query cache (the queries on screen once the session reads signed out),
   * and reads the session again. Rejects with the rpc error
   * if the server refuses (nothing on the device changes then).
   */
  deleteAccount: (input: DeleteAccountInput) => Promise<void>;
  error: DeleteAccountFailure | null;
  status: DeleteAccountStatus;
}

export interface UseDeleteAccountOptions {
  /** The platform auth client's `signOut` (web or Expo). */
  signOut: () => Promise<unknown>;
}

const FAILURE_MESSAGES = {
  INVALID_PASSWORD: "account.errors.invalidPassword",
  PASSWORD_REQUIRED: "account.errors.passwordRequired",
  RATE_LIMITED: "auth.errors.rateLimited",
  SESSION_NOT_FRESH: "account.errors.sessionNotFresh",
  UNKNOWN: "account.errors.deleteFailed",
} as const satisfies Record<DeleteAccountFailure, TranslationKey>;

/** The `@smog/i18n` key that explains a refused deletion (both apps). */
export function deleteFailureMessage(
  failure: DeleteAccountFailure
): (typeof FAILURE_MESSAGES)[DeleteAccountFailure] {
  return FAILURE_MESSAGES[failure];
}

const KNOWN_FAILURES: readonly string[] = [
  "INVALID_PASSWORD",
  "PASSWORD_REQUIRED",
  "RATE_LIMITED",
  "SESSION_NOT_FRESH",
] satisfies DeleteAccountFailure[];

function failureOf(error: unknown): DeleteAccountFailure {
  if (
    error instanceof ORPCError &&
    error.defined &&
    KNOWN_FAILURES.includes(error.code)
  ) {
    return error.code as DeleteAccountFailure;
  }
  return "UNKNOWN";
}

/** Account deletion (`account.delete`), for both apps. */
export function useDeleteAccount({
  signOut,
}: UseDeleteAccountOptions): DeleteAccount {
  const client = useRpcClient<AccountSlice>();
  const store = useLocalStoreInstance();
  const queryClient = useQueryClient();
  const { refetch } = useAuthState();
  const [state, setState] = useState<{
    error: DeleteAccountFailure | null;
    status: DeleteAccountStatus;
  }>({ error: null, status: "idle" });

  const deleteAccount = useCallback(
    async (input: DeleteAccountInput): Promise<void> => {
      setState({ error: null, status: "deleting" });
      try {
        await client.account.delete(input);
      } catch (error) {
        console.error("[account] Failed to delete the account:", error);
        setState({ error: failureOf(error), status: "error" });
        throw error;
      }
      // The account is gone: whatever fails below must not bring it back.
      try {
        await signOut();
      } catch (error) {
        // The server already ended every session; this clears the client's.
        console.error("[account] Failed to sign out after deletion:", error);
      }
      try {
        await store.reset();
      } catch (error) {
        console.error("[account] Failed to clear the local store:", error);
      }
      // Everything no screen shows goes now. A mounted query of this user
      // would refetch (401) if removed while the session still reads
      // signed in; `usePurgeOtherUsers` drops those once it reads signed
      // out, when they are disabled.
      queryClient.removeQueries({ type: "inactive" });
      refetch();
      setState({ error: null, status: "deleted" });
    },
    [client, queryClient, refetch, signOut, store]
  );

  return { deleteAccount, ...state };
}
