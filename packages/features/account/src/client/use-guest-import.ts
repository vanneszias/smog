import { useAuthState } from "@smog/auth/react";
import type { FavoritesContract } from "@smog/favorites/contract";
import type { ListsContract } from "@smog/lists/contract";
import { dismissImportFor, type GuestData } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { useRpcClient, useRpcQuery } from "@smog/rpc/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportResult } from "../schema";
import {
  type AccountSlice,
  countGuestData,
  importGuestData,
} from "./import-guest-data";

/** The reads an import changes, refetched once it succeeds. */
interface ImportedSlice {
  favorites: FavoritesContract;
  lists: ListsContract;
}

export type GuestImportStatus = "idle" | "importing" | "done" | "error";

export interface GuestImportCounts {
  favorites: number;
  lists: number;
}

export interface GuestImport {
  /** Imports the device data (never rejects: `null` and `error` on failure). */
  accept: () => Promise<ImportResult | null>;
  /** Hides the prompt for this user on this device; the data stays. */
  dismiss: () => Promise<void>;
  /**
   * What the prompt offers, or `null`: set once the session is known to be
   * signed in, the device has favorites or lists, and this user has not
   * dismissed the prompt here. It stays set while `importing` and after an
   * `error` (the data is still on the device).
   */
  pending: GuestImportCounts | null;
  /** The last `accept` result (`done`). */
  result: ImportResult | null;
  status: GuestImportStatus;
}

interface Snapshot extends GuestImportCounts {
  dismissedFor: string[];
}

function selectSnapshot(data: GuestData): Snapshot {
  return {
    ...countGuestData(data),
    dismissedFor: data.preferences.importDismissedFor,
  };
}

/** Whether the store has read its adapter (before that it holds defaults). */
function useStoreReady(): boolean {
  const store = useLocalStoreInstance();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    store.ready.then(() => {
      if (active) {
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [store]);
  return ready;
}

/**
 * The guest import prompt after sign-in or sign-up (spec §11), for both
 * apps; the apps render the sheet. `accept` runs `importGuestData`, then
 * refetches the account's favorites and lists so the API data shows.
 * Nothing is pending while the session loads, for a guest, or before the
 * local store has loaded.
 */
export function useGuestImport(): GuestImport {
  const auth = useAuthState();
  const store = useLocalStoreInstance();
  const ready = useStoreReady();
  const snapshot = useLocalStore(selectSnapshot);
  const client = useRpcClient<AccountSlice>();
  const rpc = useRpcQuery<ImportedSlice>();
  const queryClient = useQueryClient();
  const userId = auth.status === "signedIn" ? auth.user?.id : undefined;

  const [state, setState] = useState<{
    result: ImportResult | null;
    status: GuestImportStatus;
    userId: string | undefined;
  }>({ result: null, status: "idle", userId });
  // Another account (or a sign-out) starts over.
  const current =
    state.userId === userId
      ? state
      : { result: null, status: "idle" as const, userId };
  const running = useRef<Promise<ImportResult | null> | null>(null);

  const accept = useCallback((): Promise<ImportResult | null> => {
    if (!userId) {
      return Promise.resolve(null);
    }
    if (running.current) {
      return running.current;
    }
    setState({ result: null, status: "importing", userId });
    const run = (async () => {
      try {
        // analytics: guest_data_imported {favorites_added, lists_created, lists_merged}
        const result = await importGuestData({ client, store });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: rpc.favorites.key() }),
          queryClient.invalidateQueries({ queryKey: rpc.lists.key() }),
        ]);
        setState({ result, status: "done", userId });
        return result;
      } catch {
        // `importGuestData` logged it; the device data is untouched.
        setState({ result: null, status: "error", userId });
        return null;
      } finally {
        running.current = null;
      }
    })();
    running.current = run;
    return run;
  }, [client, queryClient, rpc, store, userId]);

  const dismiss = useCallback(async (): Promise<void> => {
    if (!userId) {
      return;
    }
    try {
      await store.update(dismissImportFor(userId));
    } catch (error) {
      console.error("[account] Failed to dismiss the guest import:", error);
      throw error;
    }
  }, [store, userId]);

  const hasData = snapshot.favorites > 0 || snapshot.lists > 0;
  const offered =
    ready &&
    userId !== undefined &&
    hasData &&
    !snapshot.dismissedFor.includes(userId);
  return {
    accept,
    dismiss,
    pending: offered
      ? { favorites: snapshot.favorites, lists: snapshot.lists }
      : null,
    result: current.result,
    status: current.status,
  };
}
