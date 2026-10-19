import { ORPCError } from "@orpc/client";
import {
  type RpcClient,
  type RpcQueryUtils,
  useRpcClient,
  useRpcQuery,
} from "@smog/rpc/react";
import type { SponsorshipsContract } from "../contract";

/** The contract slice these hooks know, keyed as `appContract` mounts it. */
interface SponsorshipsSlice {
  sponsorships: SponsorshipsContract;
}

export type SponsorshipsQueryUtils =
  RpcQueryUtils<SponsorshipsSlice>["sponsorships"];

/** The typed client for `sponsorships.*`, with the per-call Turnstile context. */
export type SponsorshipsClient = RpcClient<SponsorshipsSlice>["sponsorships"];

/** Availability changes when someone checks out: 30 s (the wizard refetches on focus). */
export const AVAILABILITY_STALE_TIME = 30_000;

/** The TanStack Query utils for `sponsorships.*` (see `@smog/rpc/react`). */
export function useSponsorshipsRpc(): SponsorshipsQueryUtils {
  return useRpcQuery<SponsorshipsSlice>().sponsorships;
}

/** The client for `sponsorships.*` (mutations call it directly). */
export function useSponsorshipsClient(): SponsorshipsClient {
  return useRpcClient<SponsorshipsSlice>().sponsorships;
}

/** Distinct ids in a stable order, so equal selections share one cache entry. */
export function normalizeGestureIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/**
 * A defined procedure error's code and data (`GESTURE_UNAVAILABLE`,
 * `INVALID_STATE`, `TOKEN_EXPIRED`, ...), else `null` (a network failure,
 * an undefined error).
 */
export function sponsorshipError(
  error: unknown
): { code: string; data: unknown } | null {
  if (error instanceof ORPCError && error.defined) {
    return { code: error.code, data: error.data as unknown };
  }
  return null;
}
