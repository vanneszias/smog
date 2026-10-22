import {
  addRecentGesture,
  clearRecentGestures,
  type GuestData,
} from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { GestureSummary } from "../schema";
import { CATALOG_STALE_TIME, useGesturesRpc } from "./slice";

const NO_IDS: readonly string[] = [];
const NO_GESTURES: GestureSummary[] = [];

function selectRecentGestureIds(data: GuestData): readonly string[] {
  return data.preferences.recentGestureIds ?? NO_IDS;
}

export interface RecentGestures {
  /** Remembers a gesture the visitor opened (newest first, deduped, a few). */
  add: (gestureId: string) => Promise<void>;
  clear: () => Promise<void>;
  /** The remembered gestures, newest first; ones no longer published are skipped. */
  gestures: GestureSummary[];
  /** `empty`: nothing remembered; `loading` / `error`: reading them; `ready`. */
  status: "empty" | "error" | "loading" | "ready";
}

/**
 * "Continue where you left off": the gestures this device opened lately.
 * The ids stay on the device (the local store, like recent searches, spec
 * §11); only the public `gestures.byIds` read goes out, with those ids.
 */
export function useRecentGestures(): RecentGestures {
  const store = useLocalStoreInstance();
  const ids = useLocalStore(selectRecentGestureIds);
  const rpc = useGesturesRpc();
  const query = useQuery({
    ...rpc.byIds.queryOptions({
      input: { ids: [...ids] },
      staleTime: CATALOG_STALE_TIME,
    }),
    enabled: ids.length > 0,
  });
  const add = useCallback(
    (gestureId: string) => store.update(addRecentGesture(gestureId)),
    [store]
  );
  const clear = useCallback(() => store.update(clearRecentGestures()), [store]);
  let status: RecentGestures["status"] = "ready";
  if (ids.length === 0) {
    status = "empty";
  } else if (query.isError) {
    status = "error";
  } else if (query.data === undefined) {
    status = "loading";
  }
  return {
    add,
    clear,
    gestures: ids.length === 0 ? NO_GESTURES : (query.data ?? NO_GESTURES),
    status,
  };
}
