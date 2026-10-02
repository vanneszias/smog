/**
 * Task 5: `useAdminUsers` and the user actions. Everything exported here is part of `@smog/admin/client`
 * (`index.ts` re-exports this file), so Task 5 edits only this file. Writes
 * call `useInvalidateAfterAdminWrite()` on success.
 */
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  type AdminUserListInput,
  type UserGuardReason,
  userInvalidStateDataSchema,
} from "../schema";
import {
  ADMIN_STALE_TIME,
  useAdminKey,
  useAdminRpc,
  useInvalidateAfterAdminWrite,
} from "./slice";

/**
 * The guard's reason when a user action was refused (`INVALID_STATE`,
 * ruling 7), else `null`; the UI translates it.
 */
export function userRefusalOf(error: unknown): UserGuardReason | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== "INVALID_STATE") {
    return null;
  }
  const parsed = userInvalidStateDataSchema.safeParse(data);
  return parsed.success ? parsed.data.reason : null;
}

/**
 * One page of accounts (`admin.users.list`), newest first, from D1. The
 * previous page stays on screen while the next one loads.
 */
export function useAdminUsers(input: AdminUserListInput) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.users.list.queryOptions({
    input,
    placeholderData: keepPreviousData,
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** One account with its sign-in methods and counts; off while `id` is null. */
export function useAdminUser(id: string | null) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.users.get.queryOptions({
    enabled: id !== null,
    input: { id: id ?? "" },
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/**
 * The user actions: `setRole`, `ban`, `unban`, `remove` (delete). Each
 * refetches every admin query when it settles, so a refused action (another
 * admin changed the account) shows the current state too.
 */
export function useAdminUserActions() {
  const rpc = useAdminRpc();
  const invalidate = useInvalidateAfterAdminWrite();
  const setRole = useMutation(
    rpc.users.setRole.mutationOptions({ onSettled: invalidate })
  );
  const ban = useMutation(
    rpc.users.ban.mutationOptions({ onSettled: invalidate })
  );
  const unban = useMutation(
    rpc.users.unban.mutationOptions({ onSettled: invalidate })
  );
  const remove = useMutation(
    rpc.users.delete.mutationOptions({ onSettled: invalidate })
  );
  return { ban, remove, setRole, unban };
}
