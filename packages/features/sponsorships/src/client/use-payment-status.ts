/**
 * The return page's poll of `sponsorships.paymentStatus` (S-14): every
 * 2 s while the payment is `open`, at most 15 times (30 s, the old
 * numbers), then "taking longer" with "Check again", which polls another
 * 15 times. The server settles an `open` payment from Mollie on each read
 * (ruling 2), so the page never waits for the webhook.
 */
import { isDefinedError } from "@orpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { paymentStatusInputSchema } from "../schema/status";
import { useSponsorshipsRpc } from "./slice";

export const PAYMENT_POLL_INTERVAL_MS = 2000;
export const PAYMENT_POLL_MAX_ATTEMPTS = 15;

export interface UsePaymentStatusOptions {
  intervalMs?: number;
  maxAttempts?: number;
}

/** `?payment=` as the procedure takes it (our id or `tr_…`), else `null`. */
export function paymentParam(value: unknown): string | null {
  const parsed = paymentStatusInputSchema.safeParse({ payment: value });
  return parsed.success ? parsed.data.payment : null;
}

/**
 * The payment's status for the success page. `attempt` counts the reads
 * of this round (1 after the first answer); `timedOut` is true once a
 * round ends with the payment still `open`; `checkAgain` starts a new
 * round. Disabled for `null`.
 */
export function usePaymentStatus(
  payment: string | null,
  {
    intervalMs = PAYMENT_POLL_INTERVAL_MS,
    maxAttempts = PAYMENT_POLL_MAX_ATTEMPTS,
  }: UsePaymentStatusOptions = {}
) {
  const utils = useSponsorshipsRpc();
  const queryClient = useQueryClient();
  // The answers before this round (`dataUpdateCount` never goes back).
  const [roundStart, setRoundStart] = useState(0);
  const options = utils.paymentStatus.queryOptions({
    enabled: payment !== null,
    input: { payment: payment ?? "" },
  });
  const query = useQuery({
    ...options,
    refetchInterval: (current) =>
      current.state.data?.status === "open" &&
      current.state.dataUpdateCount - roundStart < maxAttempts
        ? intervalMs
        : false,
    refetchOnWindowFocus: false,
    // An unknown payment is final; a network error is tried again.
    retry: (count, error) => !isDefinedError(error) && count < 3,
    retryDelay: 1000,
  });
  // Read `dataUpdatedAt` so every answer renders, even an unchanged one.
  const answers =
    query.dataUpdatedAt > 0
      ? (queryClient.getQueryState(options.queryKey)?.dataUpdateCount ?? 0)
      : 0;
  const attempt = Math.max(0, answers - roundStart);
  const { refetch } = query;
  const checkAgain = useCallback(() => {
    setRoundStart(answers);
    refetch().catch((error: unknown) => {
      console.error("[sponsorships] Failed to check the payment:", error);
    });
  }, [answers, refetch]);
  const timedOut = query.data?.status === "open" && attempt >= maxAttempts;
  return { ...query, attempt, checkAgain, maxAttempts, timedOut };
}
