/**
 * Task 2: `useAdminGestures`, `useAdminGesture`, `useAdminGestureMutations`
 * (and the duplicate-name check). Everything exported here is part of
 * `@smog/admin/client` (`index.ts` re-exports this file). Writes call
 * `useInvalidateAfterAdminWrite()` on success, and a stale save
 * (`CONFLICT` `stale`) is surfaced as `staleIds`.
 */
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  type AdminGestureListInput,
  catalogConflictDataSchema,
} from "../schema";
import {
  ADMIN_STALE_TIME,
  useAdminKey,
  useAdminRpc,
  useInvalidateAfterAdminWrite,
} from "./slice";

/**
 * The ids of a `CONFLICT` `stale` error (the rows that changed since they
 * were read), else `null`.
 */
export function staleIdsOf(error: unknown): string[] | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== "CONFLICT") {
    return null;
  }
  const parsed = catalogConflictDataSchema.safeParse(data);
  return parsed.success && parsed.data.reason === "stale"
    ? (parsed.data.ids ?? [])
    : null;
}

/**
 * The stale-row state the mutation hooks share: set from a `CONFLICT`
 * `stale` error (after which the admin queries are refetched, so the
 * editor can show the other admin's values), cleared on the next success
 * or by `clearStale`.
 */
export function useStaleIds() {
  const invalidate = useInvalidateAfterAdminWrite();
  const [staleIds, setStaleIds] = useState<string[] | null>(null);
  const onError = useCallback(
    async (error: unknown) => {
      const ids = staleIdsOf(error);
      if (ids) {
        setStaleIds(ids);
        await invalidate();
      }
    },
    [invalidate]
  );
  const onSuccess = useCallback(async () => {
    setStaleIds(null);
    await invalidate();
  }, [invalidate]);
  const clearStale = useCallback(() => setStaleIds(null), []);
  return { clearStale, onError, onSuccess, staleIds };
}

/**
 * One page of every gesture (`admin.gestures.list`, from D1), published or
 * not. The previous page stays on screen while the next one loads.
 */
export function useAdminGestures(input: AdminGestureListInput) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.gestures.list.queryOptions({
    input,
    placeholderData: keepPreviousData,
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** One gesture for the editor (`NOT_FOUND` for an unknown id); idle without an id. */
export function useAdminGesture(id: string | undefined) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.gestures.get.queryOptions({
    input: { id: id ?? "" },
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({
    ...options,
    enabled: id !== undefined,
    queryKey: scoped(options.queryKey),
  });
}

/**
 * Gestures with the same name (`normalizeText`-equal), for the editor's
 * warning; idle for an empty name.
 */
export function useAdminGestureNameCheck(name: string, excludeId?: string) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const trimmed = name.trim();
  const options = rpc.gestures.checkName.queryOptions({
    input:
      excludeId === undefined
        ? { name: trimmed }
        : { excludeId, name: trimmed },
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({
    ...options,
    enabled: trimmed.length > 0,
    queryKey: scoped(options.queryKey),
  });
}

/**
 * The gesture writes. Each refetches the admin and public gesture queries
 * on success. `staleIds` holds the rows of the last `CONFLICT` `stale`
 * (`update`, `saveMany`) until the next success or `clearStale()`.
 */
export function useAdminGestureMutations() {
  const rpc = useAdminRpc();
  const invalidate = useInvalidateAfterAdminWrite();
  const { clearStale, onError, onSuccess, staleIds } = useStaleIds();
  const create = useMutation(
    rpc.gestures.create.mutationOptions({ onSuccess: invalidate })
  );
  const update = useMutation(
    rpc.gestures.update.mutationOptions({ onError, onSuccess })
  );
  const saveMany = useMutation(
    rpc.gestures.saveMany.mutationOptions({ onError, onSuccess })
  );
  const setPublished = useMutation(
    rpc.gestures.setPublished.mutationOptions({ onSettled: invalidate })
  );
  const bulkUpdate = useMutation(
    rpc.gestures.bulkUpdate.mutationOptions({ onSuccess: invalidate })
  );
  const remove = useMutation(
    rpc.gestures.delete.mutationOptions({ onSuccess: invalidate })
  );
  return {
    bulkUpdate,
    clearStale,
    create,
    remove,
    saveMany,
    setPublished,
    staleIds,
    update,
  };
}
