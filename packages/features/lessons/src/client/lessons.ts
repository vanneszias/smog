/**
 * Hooks of the lesson list and the builder (phase 10c task 4) over the typed
 * `lessons` slice. Teachers and admins only: the procedures refuse anyone
 * else, so no screen outside `/admin/lessons` calls them.
 */
import { useAuthState } from "@smog/auth/react";
import { userScopedKey } from "@smog/rpc/react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
  type LessonConflictData,
  type LessonCursor,
  type LessonTemplate,
  lessonConflictDataSchema,
} from "../schema";
import { useInvalidateLessons, useLessonsRpc } from "./slice";

/** Other teachers edit lessons too: refetch after 30 s. */
const LESSON_STALE_TIME = 30_000;

/** The scoped key helper: a key tied to the signed-in user, so another account on this browser never sees it. */
function useScopedKey(): <TKey extends readonly unknown[]>(
  key: TKey
) => readonly [...TKey, { user: string | null }] {
  const { user } = useAuthState();
  const userId = user?.id;
  return useCallback(
    <TKey extends readonly unknown[]>(key: TKey) => userScopedKey(key, userId),
    [userId]
  );
}

/** The other editor's lesson a save lost to (`CONFLICT`), else `null`. */
export function lessonConflictOf(error: unknown): LessonConflictData | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== "CONFLICT") {
    return null;
  }
  const parsed = lessonConflictDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The first field error of a `VALIDATION` error as `{ field, code }`, else `null`. */
export function lessonRefusalOf(
  error: unknown
): { code: string; field: string } | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, data } = error as {
    code?: unknown;
    data?: { fieldErrors?: Record<string, string[] | undefined> };
  };
  if (code !== "VALIDATION" || !data?.fieldErrors) {
    return null;
  }
  for (const [field, codes] of Object.entries(data.fieldErrors)) {
    const [first] = codes ?? [];
    if (first) {
      return { code: first, field };
    }
  }
  return null;
}

export interface LessonListFilter {
  mine: boolean;
  query: string;
}

/** The lesson list, a keyset page at a time. */
export function useLessonList({ mine, query }: LessonListFilter) {
  const rpc = useLessonsRpc();
  const scoped = useScopedKey();
  const options = rpc.list.infiniteOptions({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: undefined as LessonCursor | undefined,
    input: (cursor: LessonCursor | undefined) => ({
      cursor,
      mine: mine || undefined,
      query: query.trim() === "" ? undefined : query.trim(),
    }),
    staleTime: LESSON_STALE_TIME,
  });
  return useInfiniteQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** One lesson with its sections and gestures. */
export function useLesson(id: string) {
  const rpc = useLessonsRpc();
  const scoped = useScopedKey();
  const options = rpc.get.queryOptions({ input: { id } });
  return useQuery({
    ...options,
    queryKey: scoped(options.queryKey),
    // The builder keeps its own draft: a refetch on focus would only race it.
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** How many of the lesson's gestures have teaching text in `locale`; `version` refreshes it after each save. */
export function useLessonReadiness(
  id: string,
  locale: string,
  version: number
) {
  const rpc = useLessonsRpc();
  const scoped = useScopedKey();
  const options = rpc.readiness.queryOptions({ input: { id, locale } });
  return useQuery({
    ...options,
    queryKey: scoped([...options.queryKey, { version }] as const),
    staleTime: LESSON_STALE_TIME,
  });
}

/**
 * What the PDF in a template and language would contain (the export
 * dialog), asked fresh every time the dialog opens or a choice changes:
 * `version` is the lesson's saved version, so a save refreshes it.
 */
export function useLessonExportPreview(
  input: { id: string; locale: string; template: LessonTemplate },
  version: number,
  enabled: boolean
) {
  const rpc = useLessonsRpc();
  const scoped = useScopedKey();
  const options = rpc.exportPreview.queryOptions({ input });
  return useQuery({
    ...options,
    enabled,
    queryKey: scoped([...options.queryKey, { version }] as const),
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}

/** Which of `gestureIds` have a drawing (the picker's marker), asked for the ids it shows. */
export function useGestureMarkers(gestureIds: readonly string[]) {
  const rpc = useLessonsRpc();
  const scoped = useScopedKey();
  const ids = [...gestureIds].sort();
  const options = rpc.gestureMarkers.queryOptions({
    input: { gestureIds: ids },
  });
  return useQuery({
    ...options,
    enabled: ids.length > 0,
    queryKey: scoped(options.queryKey),
    staleTime: LESSON_STALE_TIME,
  });
}

/**
 * The lesson writes. `create`, `duplicate` and `remove` refetch every
 * `lessons.*` query when they settle; `save` (the autosave) refetches the list
 * and the readiness only: the builder holds the lesson it is editing.
 */
export function useLessonActions() {
  const rpc = useLessonsRpc();
  const invalidate = useInvalidateLessons();
  const queryClient = useQueryClient();
  const create = useMutation(
    rpc.create.mutationOptions({ onSettled: invalidate })
  );
  const duplicate = useMutation(
    rpc.duplicate.mutationOptions({ onSettled: invalidate })
  );
  const remove = useMutation(
    rpc.delete.mutationOptions({ onSettled: invalidate })
  );
  const save = useMutation(
    rpc.update.mutationOptions({
      onSettled: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: rpc.list.key() }),
          queryClient.invalidateQueries({ queryKey: rpc.readiness.key() }),
        ]);
      },
    })
  );
  return { create, duplicate, remove, save };
}
