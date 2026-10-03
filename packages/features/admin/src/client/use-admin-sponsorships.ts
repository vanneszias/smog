/**
 * Task 6 (phase 6): the sponsorship list, detail and actions. Everything
 * exported here is part of `@smog/admin/client` (`index.ts` re-exports
 * this file). Every action refetches every `admin.*` query (the list, the
 * detail, the dashboard counts) and the public gesture queries (approve
 * and force expire change the sponsor credit) when it settles, so a
 * refused action (another admin acted first) shows the current state too.
 */
import type { InvalidStateReason } from "@smog/sponsorships/schema";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  type AdminSponsorshipListInput,
  sponsorshipInvalidStateDataSchema,
} from "../schema";
import {
  ADMIN_STALE_TIME,
  useAdminKey,
  useAdminRpc,
  useInvalidateAfterAdminWrite,
} from "./slice";

/**
 * The reason a sponsorship action or the export was refused
 * (`INVALID_STATE`: `stale`, `noVideo`, `paid`, `tooMany`, …), else
 * `null`; the UI shows `sponsorship.errors.<reason>`.
 */
export function sponsorshipRefusalOf(
  error: unknown
): InvalidStateReason | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== "INVALID_STATE") {
    return null;
  }
  const parsed = sponsorshipInvalidStateDataSchema.safeParse(data);
  return parsed.success ? parsed.data.reason : null;
}

/**
 * One page of sponsorships (`admin.sponsorships.list`) with the per-status
 * counts for the tabs, newest first, from D1. The previous page stays on
 * screen while the next one loads.
 */
export function useAdminSponsorships(input: AdminSponsorshipListInput) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.sponsorships.list.queryOptions({
    input,
    placeholderData: keepPreviousData,
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** One sponsorship's detail (A-15, A-29); off while `id` is null. */
export function useAdminSponsorship(id: string | null) {
  const rpc = useAdminRpc();
  const scoped = useAdminKey();
  const options = rpc.sponsorships.get.queryOptions({
    enabled: id !== null,
    input: { id: id ?? "" },
    staleTime: ADMIN_STALE_TIME,
  });
  return useQuery({ ...options, queryKey: scoped(options.queryKey) });
}

/** The actions `useAdminSponsorshipActions` returns, one mutation each. */
export const SPONSORSHIP_ACTIONS = [
  "approve",
  "reject",
  "requestChanges",
  "regenerateToken",
  "markPaid",
  "cancel",
  "forceExpire",
  "recordRefund",
] as const;

/**
 * The moderation and payment actions (ruling 14). `requestChanges` and
 * `regenerateToken` answer `{ url, expiresAt }`: show the link once and
 * keep it out of any cache or log.
 */
export function useAdminSponsorshipActions() {
  const rpc = useAdminRpc();
  const invalidate = useInvalidateAfterAdminWrite();
  const settled = { onSettled: invalidate };
  // The link holds a raw token: no cache keeps the answer once the
  // component has it and lets go (`gcTime: 0` drops the mutation from the
  // MutationCache as soon as no observer holds it).
  const oneTime = { ...settled, gcTime: 0 };
  return {
    approve: useMutation(rpc.sponsorships.approve.mutationOptions(settled)),
    cancel: useMutation(rpc.sponsorships.cancel.mutationOptions(settled)),
    forceExpire: useMutation(
      rpc.sponsorships.forceExpire.mutationOptions(settled)
    ),
    markPaid: useMutation(rpc.sponsorships.markPaid.mutationOptions(settled)),
    recordRefund: useMutation(
      rpc.sponsorships.recordRefund.mutationOptions(settled)
    ),
    regenerateToken: useMutation(
      rpc.sponsorships.regenerateToken.mutationOptions(oneTime)
    ),
    reject: useMutation(rpc.sponsorships.reject.mutationOptions(settled)),
    requestChanges: useMutation(
      rpc.sponsorships.requestChanges.mutationOptions(oneTime)
    ),
  } satisfies Record<(typeof SPONSORSHIP_ACTIONS)[number], unknown>;
}
