/**
 * Phase 9 task 4: the dead letters (`admin.deadLetters.*`). Everything
 * exported here is part of `@smog/admin/client` (`index.ts` re-exports this
 * file). No hook ever sees a stored body: the API does not return one.
 */
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  type DeadLetterListInput,
  type DeadLetterRefusal,
  deadLetterInvalidStateDataSchema,
} from "../schema";
import {
  ADMIN_STALE_TIME,
  useAdminKey,
  useAdminRpc,
  useInvalidateAfterAdminWrite,
} from "./slice";

/**
 * The reason a replay or discard was refused (`INVALID_STATE`), else
 * `null`; the UI translates it.
 */
export function deadLetterRefusalOf(error: unknown): DeadLetterRefusal | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== "INVALID_STATE") {
    return null;
  }
  const parsed = deadLetterInvalidStateDataSchema.safeParse(data);
  return parsed.success ? parsed.data.reason : null;
}

/**
 * One page of dead letters (`admin.deadLetters.list`), newest first. The
 * previous page stays on screen while the next one loads.
 */
export function useAdminDeadLetters(input: DeadLetterListInput) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.deadLetters.list.queryOptions({
    input,
    placeholderData: keepPreviousData,
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/**
 * `replay` and `discard`. Each refetches every admin query when it
 * settles, so a refused action (another admin was first) shows the
 * current state too.
 */
export function useAdminDeadLetterActions() {
  const rpc = useAdminRpc();
  const invalidate = useInvalidateAfterAdminWrite();
  const replay = useMutation(
    rpc.deadLetters.replay.mutationOptions({ onSettled: invalidate })
  );
  const discard = useMutation(
    rpc.deadLetters.discard.mutationOptions({ onSettled: invalidate })
  );
  return { discard, replay };
}
