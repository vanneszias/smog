import { useAuthState } from "@smog/auth/react";
import {
  type RpcClient,
  type RpcQueryUtils,
  useRpcClient,
  useRpcQuery,
  userScopedKey,
} from "@smog/rpc/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { TeacherContract } from "../contract";

/** The contract slice these hooks know, keyed as `appContract` mounts it. */
interface TeacherSlice {
  teacher: TeacherContract;
}

export type TeacherQueryUtils = RpcQueryUtils<TeacherSlice>["teacher"];

/** The typed client for `teacher.*` (the drawing upload calls it directly). */
export type TeacherClient = RpcClient<TeacherSlice>["teacher"];

/** The client for `teacher.*`. */
export function useTeacherClient(): TeacherClient {
  return useRpcClient<TeacherSlice>().teacher;
}

/** Other teachers edit the same texts: refetch after 30 s. */
export const TEACHER_STALE_TIME = 30_000;

/** The TanStack Query utils for `teacher.*` (see `@smog/rpc/react`). */
export function useTeacherRpc(): TeacherQueryUtils {
  return useRpcQuery<TeacherSlice>().teacher;
}

/** A query key scoped to the signed-in user (`userScopedKey`), so another account on this browser never sees it. */
export function useTeacherKey(): <TKey extends readonly unknown[]>(
  key: TKey
) => readonly [...TKey, { user: string | null }] {
  const { user } = useAuthState();
  const userId = user?.id;
  return useCallback(
    <TKey extends readonly unknown[]>(key: TKey) => userScopedKey(key, userId),
    [userId]
  );
}

/** What a write calls when it settles: refetch every `teacher.*` query. */
export function useInvalidateTeacher(): () => Promise<void> {
  const queryClient = useQueryClient();
  const rpc = useRpcQuery<TeacherSlice>();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: rpc.teacher.key() }),
    [queryClient, rpc]
  );
}
