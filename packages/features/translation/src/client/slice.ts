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
import type { TranslationContract } from "../contract";

/** The contract slice these hooks know, keyed as `appContract` mounts it. */
interface TranslationSlice {
  translation: TranslationContract;
}

export type TranslationQueryUtils =
  RpcQueryUtils<TranslationSlice>["translation"];

/** The typed client for `translation.*` (the audio upload calls it directly). */
export type TranslationClient = RpcClient<TranslationSlice>["translation"];

/** The client for `translation.*`. */
export function useTranslationClient(): TranslationClient {
  return useRpcClient<TranslationSlice>().translation;
}

/** Other translators edit the same strings: refetch after 30 s. */
export const TRANSLATION_STALE_TIME = 30_000;

/** The TanStack Query utils for `translation.*` (see `@smog/rpc/react`). */
export function useTranslationRpc(): TranslationQueryUtils {
  return useRpcQuery<TranslationSlice>().translation;
}

/** A query key scoped to the signed-in user (`userScopedKey`), so another account on this browser never sees it. */
export function useTranslationKey(): <TKey extends readonly unknown[]>(
  key: TKey
) => readonly [...TKey, { user: string | null }] {
  const { user } = useAuthState();
  const userId = user?.id;
  return useCallback(
    <TKey extends readonly unknown[]>(key: TKey) => userScopedKey(key, userId),
    [userId]
  );
}

/** What a language write calls when it settles: refetch every `translation.*` query. */
export function useInvalidateTranslation(): () => Promise<void> {
  const queryClient = useQueryClient();
  const rpc = useRpcQuery<TranslationSlice>();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: rpc.translation.key() }),
    [queryClient, rpc]
  );
}
