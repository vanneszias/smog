/**
 * Hooks of the translation screens (phase 10b task 4) over the typed
 * `translation` slice. A single save patches the cached strings pages in
 * place (the table stays where it is); every other write refetches.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import {
  type LanguageRefusal,
  LEGAL_ISSUE_PREFIX,
  type LegalConflictData,
  type LegalTextRef,
  languageInvalidStateDataSchema,
  legalConflictDataSchema,
  type StringConflictData,
  type StringsListInput,
  type StringsPage,
  stringConflictDataSchema,
} from "../schema";
import {
  TRANSLATION_STALE_TIME,
  useInvalidateTranslation,
  useTranslationKey,
  useTranslationRpc,
} from "./slice";

const validationDataSchema = z.object({
  fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
});

function errorParts(error: unknown): { code?: unknown; data?: unknown } {
  return typeof error === "object" && error !== null
    ? (error as { code?: unknown; data?: unknown })
    : {};
}

/** The stored text a save lost to (`CONFLICT`), else `null`. */
export function stringConflictOf(error: unknown): StringConflictData | null {
  const { code, data } = errorParts(error);
  if (code !== "CONFLICT") {
    return null;
  }
  const parsed = stringConflictDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The first field error code of a `VALIDATION` error (`value`, `content`, ...), else `null`. */
export function validationCodeOf(error: unknown, field: string): string | null {
  const { code, data } = errorParts(error);
  if (code !== "VALIDATION") {
    return null;
  }
  const parsed = validationDataSchema.safeParse(data);
  return parsed.success ? (parsed.data.fieldErrors[field]?.[0] ?? null) : null;
}

/** Why a language update was refused (`INVALID_STATE`), else `null`. */
export function languageRefusalOf(error: unknown): LanguageRefusal | null {
  const { code, data } = errorParts(error);
  if (code !== "INVALID_STATE") {
    return null;
  }
  const parsed = languageInvalidStateDataSchema.safeParse(data);
  return parsed.success ? parsed.data.reason : null;
}

/** One page of the strings table, filters applied. The previous page stays while the next loads. */
export function useTranslationStrings(input: StringsListInput) {
  const rpc = useTranslationRpc();
  const scoped = useTranslationKey();
  const options = rpc.strings.list.queryOptions({
    input,
    placeholderData: keepPreviousData,
    staleTime: TRANSLATION_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/**
 * Saves one text. On success the cell is replaced in every cached page
 * (no refetch, so an editor's place and the other rows stay put) and the
 * coverage is refetched.
 */
export function useSaveString() {
  const rpc = useTranslationRpc();
  const queryClient = useQueryClient();
  return useMutation(
    rpc.strings.save.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueriesData<StringsPage>(
          { queryKey: rpc.strings.list.key() },
          (page) =>
            page && {
              ...page,
              items: page.items.map((row) =>
                row.key === result.key
                  ? {
                      ...row,
                      cells: { ...row.cells, [result.locale]: result.cell },
                    }
                  : row
              ),
            }
        );
        queryClient
          .invalidateQueries({ queryKey: rpc.coverage.key() })
          .catch((error: unknown) => {
            console.error(
              "[translation] Failed to refresh the coverage:",
              error
            );
          });
      },
    })
  );
}

/** The export file of one language or all (a mutation: it is asked for, not watched). */
export function useExportStrings() {
  const rpc = useTranslationRpc();
  return useMutation(rpc.strings.export.mutationOptions());
}

/** The dry run of an import. */
export function usePreviewImport() {
  const rpc = useTranslationRpc();
  return useMutation(rpc.strings.preview.mutationOptions());
}

/** Applies an import, then refetches every translation query. */
export function useApplyImport() {
  const rpc = useTranslationRpc();
  const invalidate = useInvalidateTranslation();
  return useMutation(
    rpc.strings.import.mutationOptions({ onSettled: invalidate })
  );
}

/** Every language with its state (translator or admin). */
export function useLanguages() {
  const rpc = useTranslationRpc();
  const scoped = useTranslationKey();
  const options = rpc.languages.list.queryOptions({
    staleTime: TRANSLATION_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** Add and change a language (admin). */
export function useLanguageActions() {
  const rpc = useTranslationRpc();
  const invalidate = useInvalidateTranslation();
  const create = useMutation(
    rpc.languages.create.mutationOptions({ onSettled: invalidate })
  );
  const update = useMutation(
    rpc.languages.update.mutationOptions({ onSettled: invalidate })
  );
  return { create, update };
}

/** Coverage per enabled language (the dashboard card and the strings header). */
export function useTranslationCoverage() {
  const rpc = useTranslationRpc();
  const scoped = useTranslationKey();
  const options = rpc.coverage.queryOptions({
    staleTime: TRANSLATION_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** The stored draft a legal save or publish lost to (`CONFLICT`), else `null`. */
export function legalConflictOf(error: unknown): LegalConflictData | null {
  const { code, data } = errorParts(error);
  if (code !== "CONFLICT") {
    return null;
  }
  const parsed = legalConflictDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The place and code of every issue a refused legal text carries (`VALIDATION`), else `[]`. */
export function legalIssuesOf(
  error: unknown
): { code: string; path: string }[] {
  const { code, data } = errorParts(error);
  if (code !== "VALIDATION") {
    return [];
  }
  const parsed = validationDataSchema.safeParse(data);
  if (!parsed.success) {
    return [];
  }
  return Object.entries(parsed.data.fieldErrors).flatMap(([key, codes]) =>
    key.startsWith(LEGAL_ISSUE_PREFIX)
      ? (codes ?? []).map((issue) => ({
          code: issue,
          path: key.slice(LEGAL_ISSUE_PREFIX.length),
        }))
      : []
  );
}

/** Every legal text with its published version and whether a draft exists. */
export function useLegalOverview() {
  const rpc = useTranslationRpc();
  const scoped = useTranslationKey();
  const options = rpc.legal.list.queryOptions({
    staleTime: TRANSLATION_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** One text for the editor: draft, published text, Dutch source and history. */
export function useLegalDetail(ref: LegalTextRef) {
  const rpc = useTranslationRpc();
  const scoped = useTranslationKey();
  const options = rpc.legal.get.queryOptions({
    input: ref,
    staleTime: TRANSLATION_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** The text of one earlier version (the history preview), fetched when asked for. */
export function useLegalVersion(ref: LegalTextRef, version: number | null) {
  const rpc = useTranslationRpc();
  const scoped = useTranslationKey();
  const options = rpc.legal.version.queryOptions({
    input: { ...ref, version: version ?? 1 },
    staleTime: TRANSLATION_STALE_TIME,
  });
  return useQuery({
    ...options,
    enabled: version !== null,
    queryKey: scoped(options.queryKey),
  });
}

/** Save the draft, publish it, restore an earlier version: each refetches the legal queries when it settles. */
export function useLegalActions() {
  const rpc = useTranslationRpc();
  const invalidate = useInvalidateTranslation();
  const save = useMutation(
    rpc.legal.save.mutationOptions({ onSettled: invalidate })
  );
  const publish = useMutation(
    rpc.legal.publish.mutationOptions({ onSettled: invalidate })
  );
  const restore = useMutation(
    rpc.legal.restore.mutationOptions({ onSettled: invalidate })
  );
  return { publish, restore, save };
}
