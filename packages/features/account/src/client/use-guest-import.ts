import { useAnalytics } from "@smog/analytics/react";
import { useAuthState } from "@smog/auth/react";
import type { FavoritesContract } from "@smog/favorites/contract";
import { useTranslation } from "@smog/i18n/react";
import type { ListsContract } from "@smog/lists/contract";
import { dismissImportFor, type GuestData } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { useRpcClient, useRpcQuery } from "@smog/rpc/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { ImportResult } from "../schema";
import {
  type AccountSlice,
  countGuestData,
  importGuestData,
} from "./import-guest-data";
import { useStoreReady } from "./store-ready";

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
  /**
   * Imports the device data. Never rejects: `null` and `status: "error"`
   * on failure. A second call while this user's import runs gets the same
   * promise.
   */
  accept: () => Promise<ImportResult | null>;
  /** Hides the prompt for this user on this device; the data stays. Never rejects. */
  dismiss: () => Promise<void>;
  /**
   * What the prompt offers, or `null`: set once the session is known to be
   * signed in, the device has favorites or lists, and this user has not
   * dismissed the prompt here. It stays set while `importing` and after an
   * `error` (the data is still on the device), and after `done` when part
   * of the data did not fit (it stays on the device).
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

/**
 * The guest import prompt after sign-in or sign-up (spec §11), for both
 * apps; the apps render the sheet. `accept` runs `importGuestData`, then
 * refetches the account's favorites and lists so the API data shows.
 * Nothing is pending while the session loads, for a guest, or before the
 * local store has loaded.
 */
export function useGuestImport(): GuestImport {
  const auth = useAuthState();
  const { t } = useTranslation();
  const analytics = useAnalytics();
  const store = useLocalStoreInstance();
  const ready = useStoreReady();
  const snapshot = useLocalStore(selectSnapshot);
  const client = useRpcClient<AccountSlice>();
  const rpc = useRpcQuery<ImportedSlice>();
  const queryClient = useQueryClient();
  const userId = auth.status === "signedIn" ? auth.user?.id : undefined;
  const untitledListName = t("auth.import.untitledList");

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
  /** The import in flight, per user: another user never gets it. */
  const running = useRef<{
    promise: Promise<ImportResult | null>;
    userId: string;
  } | null>(null);

  const accept = useCallback((): Promise<ImportResult | null> => {
    if (!userId) {
      return Promise.resolve(null);
    }
    if (running.current) {
      return running.current.userId === userId
        ? running.current.promise
        : Promise.resolve(null);
    }
    setState({ result: null, status: "importing", userId });
    const promise = (async () => {
      try {
        const result = await importGuestData({
          client,
          store,
          untitledListName,
        });
        analytics.track({
          name: "guest_data_imported",
          properties: {
            favorites: result.favoritesAdded,
            lists: result.listsCreated + result.listsMerged,
          },
        });
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
    running.current = { promise, userId };
    return promise;
  }, [analytics, client, queryClient, rpc, store, untitledListName, userId]);

  const dismiss = useCallback(async (): Promise<void> => {
    if (!userId) {
      return;
    }
    try {
      await store.update(dismissImportFor(userId));
    } catch (error) {
      // The prompt then shows again next time; nothing else to do.
      console.error("[account] Failed to dismiss the guest import:", error);
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
