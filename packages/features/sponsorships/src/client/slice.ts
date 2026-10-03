import { type RpcQueryUtils, useRpcQuery } from "@smog/rpc/react";
import type { SponsorshipsContract } from "../contract";

/** The contract slice these hooks know, keyed as `appContract` mounts it. */
interface SponsorshipsSlice {
  sponsorships: SponsorshipsContract;
}

export type SponsorshipsQueryUtils =
  RpcQueryUtils<SponsorshipsSlice>["sponsorships"];

/** Availability changes when someone checks out: 30 s (the wizard refetches on focus). */
export const AVAILABILITY_STALE_TIME = 30_000;

/** The TanStack Query utils for `sponsorships.*` (see `@smog/rpc/react`). */
export function useSponsorshipsRpc(): SponsorshipsQueryUtils {
  return useRpcQuery<SponsorshipsSlice>().sponsorships;
}

/** Distinct ids in a stable order, so equal selections share one cache entry. */
export function normalizeGestureIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}
