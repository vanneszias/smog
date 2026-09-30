import { useAuthState } from "@smog/auth/react";
import { usePurgeOtherUsers, userScopedKey } from "@smog/rpc/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  type AccountActionResult,
  type AuthCall,
  type AuthCallError,
  thrownResult,
  toActionResult,
} from "./sign-in-methods";
import { useAccount } from "./use-account";

/** A passkey row as Better Auth's client returns it (dates parsed or not). */
interface PasskeyRow {
  createdAt: Date | string | number;
  id: string;
  name?: string | null | undefined;
}

/** The passkey plugin's client calls (web only for now, DECISIONS). */
export interface PasskeysClient {
  passkey: {
    addPasskey: (options?: { name?: string }) => AuthCall;
    deletePasskey: (body: { id: string }) => AuthCall;
    listUserPasskeys: () => Promise<{
      data?: readonly PasskeyRow[] | null;
      error?: AuthCallError | null;
    }>;
  };
}

export interface Passkey {
  /** Epoch milliseconds. */
  createdAt: number;
  id: string;
  /** The name given when it was added (`null`: unnamed). */
  name: string | null;
}

export type PasskeysStatus = "loading" | "ready" | "error" | "signedOut";

export interface Passkeys {
  /** Registers a passkey on this device (the browser's WebAuthn prompt). */
  add: (options?: { name?: string }) => Promise<AccountActionResult>;
  /** Oldest first. Empty while loading, on error and for guests. */
  passkeys: Passkey[];
  remove: (id: string) => Promise<AccountActionResult>;
  status: PasskeysStatus;
}

export interface UsePasskeysOptions {
  client: PasskeysClient;
}

const PASSKEYS_KEY = ["account", "passkeys"] as const;

function toPasskey(row: PasskeyRow): Passkey {
  return {
    createdAt: new Date(row.createdAt).getTime(),
    id: row.id,
    name: row.name?.trim() || null,
  };
}

/**
 * The signed-in user's passkeys (Better Auth `@better-auth/passkey`): list,
 * add and remove. After a change the list and the profile are read again.
 * Never rejects: a result says why a change failed.
 */
export function usePasskeys({ client }: UsePasskeysOptions): Passkeys {
  const auth = useAuthState();
  usePurgeOtherUsers();
  const queryClient = useQueryClient();
  const { refetch: refetchMe } = useAccount();
  const userId = auth.status === "signedIn" ? auth.user?.id : undefined;
  const queryKey = useMemo(() => userScopedKey(PASSKEYS_KEY, userId), [userId]);
  const query = useQuery({
    enabled: userId !== undefined,
    queryFn: async (): Promise<Passkey[]> => {
      const { data, error } = await client.passkey.listUserPasskeys();
      if (error) {
        console.error("[account] Failed to list the passkeys:", error);
        throw new Error(error.code ?? "PASSKEYS_FAILED");
      }
      return (data ?? [])
        .map(toPasskey)
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    queryKey,
  });

  const after = useCallback(
    async (result: AccountActionResult): Promise<AccountActionResult> => {
      if (result.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey }),
          refetchMe(),
        ]);
      }
      return result;
    },
    [queryClient, queryKey, refetchMe]
  );

  const add = useCallback(
    async (options?: { name?: string }): Promise<AccountActionResult> => {
      try {
        return await after(
          toActionResult(
            await client.passkey.addPasskey(options),
            "add a passkey"
          )
        );
      } catch (error) {
        return thrownResult(error, "add a passkey");
      }
    },
    [after, client]
  );

  const remove = useCallback(
    async (id: string): Promise<AccountActionResult> => {
      try {
        return await after(
          toActionResult(
            await client.passkey.deletePasskey({ id }),
            "remove a passkey"
          )
        );
      } catch (error) {
        return thrownResult(error, "remove a passkey");
      }
    },
    [after, client]
  );

  let status: PasskeysStatus = "loading";
  if (auth.status === "signedOut") {
    status = "signedOut";
  } else if (userId !== undefined && query.status !== "pending") {
    status = query.status === "success" ? "ready" : "error";
  }
  return {
    add,
    passkeys: userId === undefined ? [] : (query.data ?? []),
    remove,
    status,
  };
}
