import { useAuthState } from "@smog/auth/react";
import type { GesturesContract } from "@smog/gestures/contract";
import {
  type RpcQueryUtils,
  useRpcQuery,
  userScopedKey,
} from "@smog/rpc/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { AdminContract } from "../contract";

/** The contract slices these hooks know, keyed as `appContract` mounts them. */
interface AdminSlice {
  admin: AdminContract;
  gestures: GesturesContract;
}

export type AdminQueryUtils = RpcQueryUtils<AdminSlice>["admin"];

/** Admin data changes under other admins' hands: refetch after 30 s. */
export const ADMIN_STALE_TIME = 30_000;

/** The TanStack Query utils for `admin.*` (see `@smog/rpc/react`). */
export function useAdminRpc(): AdminQueryUtils {
  return useRpcQuery<AdminSlice>().admin;
}

/**
 * A query key scoped to the signed-in admin (`userScopedKey`), so another
 * account on this browser never sees it (`PurgeOtherUsers`).
 */
export function useAdminKey(): <TKey extends readonly unknown[]>(
  key: TKey
) => readonly [...TKey, { user: string | null }] {
  const { user } = useAuthState();
  const userId = user?.id;
  return useCallback(
    <TKey extends readonly unknown[]>(key: TKey) => userScopedKey(key, userId),
    [userId]
  );
}

/**
 * What every admin write calls on success: it refetches every `admin.*`
 * query and the public `gestures.*` ones (admin reads come from D1, and
 * the public pages must show the change at once).
 */
export function useInvalidateAfterAdminWrite(): () => Promise<void> {
  const queryClient = useQueryClient();
  const rpc = useRpcQuery<AdminSlice>();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: rpc.admin.key() }),
      queryClient.invalidateQueries({ queryKey: rpc.gestures.key() }),
    ]);
  }, [queryClient, rpc]);
}
