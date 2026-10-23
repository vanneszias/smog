/**
 * Phase 10b task 5: the gesture and category translations
 * (`catalogTranslation.*`, open to a translator). Everything exported here
 * is part of `@smog/admin/client`. A save that lost to another translator
 * (`CONFLICT` `stale`) is `isStaleTranslation(error)`: the editor then
 * refetches the newer text and lets the translator decide.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { TranslationGestureListInput, TranslationStatus } from "../schema";
import {
  ADMIN_STALE_TIME,
  useAdminKey,
  useCatalogTranslationRpc,
  useInvalidateAfterAdminWrite,
} from "./slice";

/** Whether `error` is a translation save that lost to another save (`CONFLICT` `stale`). */
export function isStaleTranslation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, data } = error as { code?: unknown; data?: unknown };
  return (
    code === "CONFLICT" &&
    typeof data === "object" &&
    data !== null &&
    (data as { reason?: unknown }).reason === "stale"
  );
}

/** The "needs translation" counts of every enabled non-default language. */
export function useTranslationReports() {
  const rpc = useCatalogTranslationRpc();
  const scoped = useAdminKey();
  const options = rpc.reports.queryOptions({ staleTime: ADMIN_STALE_TIME });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** One gesture's default text and translations (idle without an id). */
export function useTranslatableGesture(id: string | undefined) {
  const rpc = useCatalogTranslationRpc();
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

/** A page of gestures with their translation in one language. */
export function useTranslationGestures(input: TranslationGestureListInput) {
  const rpc = useCatalogTranslationRpc();
  const scoped = useAdminKey();
  const options = rpc.gestures.list.queryOptions({
    input,
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** Every category with its name in one language. */
export function useTranslationCategories(
  locale: string,
  status: TranslationStatus = "all"
) {
  const rpc = useCatalogTranslationRpc();
  const scoped = useAdminKey();
  const options = rpc.categories.list.queryOptions({
    input: { locale, status },
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/**
 * The translation writes. Each refetches the translation, admin and public
 * gesture queries on success (the public pages show the change at once).
 */
export function useCatalogTranslationMutations() {
  const rpc = useCatalogTranslationRpc();
  const invalidate = useInvalidateAfterAdminWrite();
  const settle = useCallback(() => invalidate(), [invalidate]);
  const saveGesture = useMutation(
    rpc.gestures.save.mutationOptions({ onSettled: settle })
  );
  const saveCategory = useMutation(
    rpc.categories.save.mutationOptions({ onSettled: settle })
  );
  return { saveCategory, saveGesture };
}
