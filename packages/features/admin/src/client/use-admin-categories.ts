/**
 * Task 2: `useAdminCategories`, `useAdminCategoryMutations`. Everything
 * exported here is part of `@smog/admin/client` (`index.ts` re-exports
 * this file). Writes call `useInvalidateAfterAdminWrite()` on success.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ADMIN_STALE_TIME,
  useAdminKey,
  useAdminRpc,
  useInvalidateAfterAdminWrite,
} from "./slice";
import { useStaleIds } from "./use-admin-gestures";

/**
 * Every category (published or not) with its gesture counts, from D1
 * (`admin.categories.list`), never the public `gestures.categories`.
 */
export function useAdminCategories() {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.categories.list.queryOptions({
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/**
 * The category writes. Each refetches the admin and public gesture queries
 * (the public categories and search results change). `staleIds` holds the
 * category of the last stale rename until the next success or
 * `clearStale()`.
 */
export function useAdminCategoryMutations() {
  const rpc = useAdminRpc();
  const invalidate = useInvalidateAfterAdminWrite();
  const { clearStale, onError, onSuccess, staleIds } = useStaleIds();
  const create = useMutation(
    rpc.categories.create.mutationOptions({ onSuccess: invalidate })
  );
  const update = useMutation(
    rpc.categories.update.mutationOptions({ onError, onSuccess })
  );
  const setPublished = useMutation(
    rpc.categories.setPublished.mutationOptions({ onSettled: invalidate })
  );
  // A refused order (another admin added or deleted one) refetches too.
  const reorder = useMutation(
    rpc.categories.reorder.mutationOptions({ onSettled: invalidate })
  );
  const remove = useMutation(
    rpc.categories.delete.mutationOptions({ onSuccess: invalidate })
  );
  return {
    clearStale,
    create,
    remove,
    reorder,
    setPublished,
    staleIds,
    update,
  };
}
