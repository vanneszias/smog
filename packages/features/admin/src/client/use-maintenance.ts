/**
 * Task 6: the maintenance setting (`admin.maintenance.*`, ruling 9).
 * Everything exported here is part of `@smog/admin/client` (`index.ts`
 * re-exports this file).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ADMIN_STALE_TIME,
  useAdminKey,
  useAdminRpc,
  useInvalidateAfterAdminWrite,
} from "./slice";

/** The stored maintenance setting (read from KV with no cache). */
export function useMaintenance() {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.maintenance.get.queryOptions({
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/**
 * `admin.maintenance.set`. It refetches every admin query when it settles,
 * so a failed change (or one another admin made) shows the stored state.
 * The site asks for the acting admin's bypass cookie before enabling.
 */
export function useSetMaintenance() {
  const rpc = useAdminRpc();
  const invalidate = useInvalidateAfterAdminWrite();
  return useMutation(
    rpc.maintenance.set.mutationOptions({ onSettled: invalidate })
  );
}
