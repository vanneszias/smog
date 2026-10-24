/**
 * Hooks of the "Teacher info" tabs (phase 10c task 2) over the typed
 * `teacher` slice.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type TeacherInfoConflictData,
  teacherInfoConflictDataSchema,
} from "../schema";
import {
  TEACHER_STALE_TIME,
  useInvalidateTeacher,
  useTeacherKey,
  useTeacherRpc,
} from "./slice";

/** The stored row a save lost to (`CONFLICT`), else `null`. */
export function teacherConflictOf(
  error: unknown
): TeacherInfoConflictData | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== "CONFLICT") {
    return null;
  }
  const parsed = teacherInfoConflictDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** One gesture's teacher information in every language (teacher, translator or admin). */
export function useTeacherInfo(gestureId: string) {
  const rpc = useTeacherRpc();
  const scoped = useTeacherKey();
  const options = rpc.getInfo.queryOptions({
    input: { gestureId },
    staleTime: TEACHER_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** Saves one language's texts, then refetches the gesture's information. */
export function useSaveTeacherInfo() {
  const rpc = useTeacherRpc();
  const invalidate = useInvalidateTeacher();
  return useMutation(rpc.saveInfo.mutationOptions({ onSettled: invalidate }));
}
