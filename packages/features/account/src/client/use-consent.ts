import { useAuthState } from "@smog/auth/react";
import { type LocalStore, setConsent } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import {
  usePurgeOtherUsers,
  useRpcClient,
  useRpcQuery,
  userScopedKey,
} from "@smog/rpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConsentSetSource, ConsentState } from "../schema";
import { type AccountSlice, importGuestConsent } from "./import-guest-data";
import { useStoreReady } from "./store-ready";

/** The decision changes only through this user; every write sets it. */
const CONSENT_STALE_TIME = 5 * 60_000;

export type ConsentStatus = "loading" | "ready" | "error";

/**
 * The users whose device choice was sent this session, per store: every
 * `useConsent` sees the same state, and only the first carries it.
 */
const CARRIED = new WeakMap<LocalStore, Set<string>>();

function carriedFor(store: LocalStore): Set<string> {
  let users = CARRIED.get(store);
  if (!users) {
    users = new Set();
    CARRIED.set(store, users);
  }
  return users;
}

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
   * policy version, so a guest is asked only while undecided; a copy of an
   * account's decision (`mirroredFrom`, left after sign-out) is not the
   * guest's and counts as undecided. `false` too
   * while a device choice is being carried to an account that never
   * decided: that choice stands.
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
 * store (so the device keeps it after signing out, for that account only:
 * a guest on the same device is asked for their own). When the account never
 * decided and the device has a choice, that choice is carried to the
 * account (`importGuestConsent`, source `import`) without the import sheet;
 * until it lands `analytics` stays `null` and nothing asks again.
 */
export function useConsent(): Consent {
  const auth = useAuthState();
  usePurgeOtherUsers();
  const store = useLocalStoreInstance();
  const ready = useStoreReady();
  const local = useLocalStore((data) => data.consent);
  const rpc = useRpcQuery<AccountSlice>();
  const client = useRpcClient<AccountSlice>();
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
    (server?.decidedAt ?? undefined) === local.decidedAt &&
    local.mirroredFrom === userId;
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
        .update(setConsent(server.analytics, server.decidedAt, userId))
        .catch((error: unknown) => {
          // The server decision still applies; the device copy follows later.
          console.error("[account] Failed to mirror the consent:", error);
        });
    }
  }, [mirrored, ready, server, store, userId]);

  // A guest's own device choice (not a copy of some account's decision)
  // for an account that never decided (not an old yes).
  const carrying =
    ready &&
    userId !== undefined &&
    server !== undefined &&
    server.decidedAt === null &&
    local.analytics !== null &&
    local.decidedAt !== undefined &&
    local.mirroredFrom === undefined;
  const readAt = remote.dataUpdatedAt;
  useEffect(() => {
    // `readAt`: every consent read (focus, reconnect) may retry a failed carry.
    if (!(carrying && userId && readAt) || carriedFor(store).has(userId)) {
      return;
    }
    carriedFor(store).add(userId);
    importGuestConsent({
      // Read what the account now holds before the device copy goes: the
      // server may have kept a newer decision instead of this one.
      beforeClear: () =>
        queryClient.fetchQuery({ ...options, queryKey, staleTime: 0 }),
      client,
      store,
    }).catch(() => {
      // Logged; the choice stays on the device. The next read retries.
      carriedFor(store).delete(userId);
    });
  }, [carrying, client, options, queryClient, queryKey, readAt, store, userId]);

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
          await store.update(
            setConsent(next.analytics, next.decidedAt, userId)
          );
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
    // A shared device: the last account's mirrored yes is not this guest's
    // consent. The guest's own choice (`set`) replaces the copy.
    const own = local.mirroredFrom === undefined ? local.analytics : null;
    return {
      analytics: own,
      needsDecision: own === null,
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
    needsDecision: needsDecision && !carrying,
    set,
    status: "ready",
  };
}

export interface ConsentChoice {
  /** A decision is being saved (disable the prompt's buttons). */
  busy: boolean;
  /**
   * Saves a decision (`useConsent().set`): `true` once saved, `false` if it
   * failed (logged; the app says so). Never rejects.
   */
  choose: (value: boolean) => Promise<boolean>;
}

export interface ConsentChoiceOptions {
  /** A save failed (logged): the app says so (a toast). */
  onSaveFailed?: () => void;
}

/** The consent prompt and switch's save step, shared by both apps. */
export function useConsentChoice({
  onSaveFailed,
}: ConsentChoiceOptions = {}): ConsentChoice {
  const { set } = useConsent();
  const [busy, setBusy] = useState(false);
  const choose = useCallback(
    async (value: boolean): Promise<boolean> => {
      setBusy(true);
      try {
        await set(value);
        return true;
      } catch {
        // `set` logged it.
        onSaveFailed?.();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onSaveFailed, set]
  );
  return { busy, choose };
}
