import { useAuthState } from "@smog/auth/react";
import { setConsent } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import {
  usePurgeOtherUsers,
  useRpcQuery,
  userScopedKey,
} from "@smog/rpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import type { ConsentSetSource, ConsentState } from "../schema";
import type { AccountSlice } from "./import-guest-data";
import { useStoreReady } from "./store-ready";

/** The decision changes only through this user; every write sets it. */
const CONSENT_STALE_TIME = 5 * 60_000;

export type ConsentStatus = "loading" | "ready" | "error";

export interface Consent {
  /**
   * The analytics decision: `null` while undecided, while `loading` or on
   * `error`, and while a yes given under an older policy waits for a new
   * decision, so nothing is ever sent without a current yes.
   */
  analytics: boolean | null;
  /**
   * Show the consent prompt: undecided, or signed in with a yes given
   * under an older policy (`CONSENT_POLICY_VERSION`); an old no stays.
   * `false` while `loading` or on `error`. A guest's device choice has no
   * policy version, so a guest is asked only while undecided.
   */
  needsDecision: boolean;
  /**
   * Records a decision. Signed in, it is appended to the consent log first
   * and then mirrored to the device; a guest's stays on the device. Rejects
   * (and changes nothing) if saving fails.
   */
  set: (value: boolean) => Promise<void>;
  status: ConsentStatus;
}

/** Where the decision is made: the app sets `navigator.product`. */
function consentSource(): ConsentSetSource {
  // Read loosely: the React Native `Navigator` type has no `product`.
  const { navigator: nav } = globalThis as {
    navigator?: { product?: string };
  };
  return nav?.product === "ReactNative" ? "mobile" : "web";
}

/**
 * The analytics consent (spec §5.3, §11), platform-neutral. A guest's
 * decision lives in the local store only. Signed in, the account's consent
 * log is the source: it is read from the server and mirrored to the local
 * store (so the device keeps it after signing out); while the account has
 * no decision the device's is left alone (the guest import carries it).
 */
export function useConsent(): Consent {
  const auth = useAuthState();
  usePurgeOtherUsers();
  const store = useLocalStoreInstance();
  const ready = useStoreReady();
  const local = useLocalStore((data) => data.consent);
  const rpc = useRpcQuery<AccountSlice>();
  const queryClient = useQueryClient();
  const userId = auth.status === "signedIn" ? auth.user?.id : undefined;
  const options = rpc.account.consent.get.queryOptions({
    staleTime: CONSENT_STALE_TIME,
  });
  const queryKey = useMemo(
    // Stable per user, so `set` / `updateProfile` keep their identity.
    () =>
      userScopedKey(rpc.account.consent.get.queryOptions().queryKey, userId),
    [rpc, userId]
  );
  const remote = useQuery({
    ...options,
    enabled: userId !== undefined,
    queryKey,
  });
  const { mutateAsync } = useMutation(
    rpc.account.consent.set.mutationOptions()
  );

  const server = userId === undefined ? undefined : remote.data;
  const mirrored =
    server?.analytics === local.analytics &&
    (server?.decidedAt ?? undefined) === local.decidedAt;
  useEffect(() => {
    if (
      !ready ||
      server === undefined ||
      server.analytics === null ||
      server.decidedAt === null ||
      // A yes under an older policy is not current: the device keeps its own.
      server.needsDecision
    ) {
      return;
    }
    if (!mirrored) {
      store
        .update(setConsent(server.analytics, server.decidedAt))
        .catch((error: unknown) => {
          // The server decision still applies; the device copy follows later.
          console.error("[account] Failed to mirror the consent:", error);
        });
    }
  }, [mirrored, ready, server, store]);

  const set = useCallback(
    async (value: boolean): Promise<void> => {
      try {
        if (userId === undefined) {
          await store.update(setConsent(value));
          return;
        }
        const next: ConsentState = await mutateAsync({
          analytics: value,
          source: consentSource(),
        });
        queryClient.setQueryData(queryKey, next);
        if (next.analytics !== null && next.decidedAt !== null) {
          await store.update(setConsent(next.analytics, next.decidedAt));
        }
      } catch (error) {
        console.error("[account] Failed to save the consent decision:", error);
        throw error;
      }
    },
    [mutateAsync, queryClient, queryKey, store, userId]
  );

  const unknown = { analytics: null, needsDecision: false, set } as const;
  if (auth.status === "loading" || !ready) {
    return { ...unknown, status: "loading" };
  }
  if (userId === undefined) {
    return {
      analytics: local.analytics,
      needsDecision: local.analytics === null,
      set,
      status: "ready",
    };
  }
  if (remote.status === "pending") {
    return { ...unknown, status: "loading" };
  }
  if (remote.status === "error") {
    return { ...unknown, status: "error" };
  }
  const { needsDecision } = remote.data;
  return {
    analytics: needsDecision ? null : remote.data.analytics,
    needsDecision,
    set,
    status: "ready",
  };
}
