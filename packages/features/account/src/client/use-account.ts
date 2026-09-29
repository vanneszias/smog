import { useAuthState } from "@smog/auth/react";
import {
  usePurgeOtherUsers,
  useRpcQuery,
  userScopedKey,
} from "@smog/rpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { Me, UpdateProfileInput } from "../schema";
import type { AccountSlice } from "./import-guest-data";

/** The profile changes only through this user; every write sets it. */
const ACCOUNT_STALE_TIME = 60_000;

export type AccountStatus = "loading" | "ready" | "error" | "signedOut";

export interface Account {
  /** The profile and sign-in methods, once loaded. */
  me: Me | undefined;
  /** Refetches `me` (after linking a provider or adding a passkey). */
  refetch: () => Promise<void>;
  status: AccountStatus;
  /**
   * Saves the name and/or the language, then reads the session again (it
   * carries the name). Rejects if the call fails.
   */
  updateProfile: (input: UpdateProfileInput) => Promise<Me>;
}

/** The signed-in user's profile (`account.me`, `account.updateProfile`). */
export function useAccount(): Account {
  const auth = useAuthState();
  usePurgeOtherUsers();
  const rpc = useRpcQuery<AccountSlice>();
  const queryClient = useQueryClient();
  const userId = auth.status === "signedIn" ? auth.user?.id : undefined;
  const options = rpc.account.me.queryOptions({
    staleTime: ACCOUNT_STALE_TIME,
  });
  const queryKey = useMemo(
    // Stable per user, so `set` / `updateProfile` keep their identity.
    () => userScopedKey(rpc.account.me.queryOptions().queryKey, userId),
    [rpc, userId]
  );
  const me = useQuery({
    ...options,
    enabled: userId !== undefined,
    queryKey,
  });
  const { mutateAsync } = useMutation(
    rpc.account.updateProfile.mutationOptions()
  );
  const { refetch: refetchSession } = auth;

  const updateProfile = useCallback(
    async (input: UpdateProfileInput): Promise<Me> => {
      try {
        const next = await mutateAsync(input);
        queryClient.setQueryData(queryKey, next);
        refetchSession();
        return next;
      } catch (error) {
        console.error("[account] Failed to update the profile:", error);
        throw error;
      }
    },
    [mutateAsync, queryClient, queryKey, refetchSession]
  );
  const { refetch: refetchMe } = me;
  const refetch = useCallback(async (): Promise<void> => {
    await refetchMe();
  }, [refetchMe]);

  let status: AccountStatus = "loading";
  if (auth.status === "signedOut") {
    status = "signedOut";
  } else if (userId !== undefined && me.status !== "pending") {
    status = me.status === "success" ? "ready" : "error";
  }
  return {
    me: userId === undefined ? undefined : me.data,
    refetch,
    status,
    updateProfile,
  };
}
