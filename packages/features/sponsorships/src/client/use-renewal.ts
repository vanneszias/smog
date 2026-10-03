/**
 * The renewal page (S-20, ruling 11): the sponsorship to renew and its
 * price (`sponsorships.renewal.get`), and "Pay" (`renewal.checkout`, with
 * Turnstile), which redirects to Mollie. The return page is the wizard's
 * success page.
 */
import { isDefinedError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  sponsorshipError,
  useSponsorshipsClient,
  useSponsorshipsRpc,
} from "./slice";
import { useRedirecting } from "./use-checkout";

/** The link's sponsorship; `TOKEN_INVALID` / `TOKEN_EXPIRED` are final. */
export function useRenewal(token: string | null) {
  const utils = useSponsorshipsRpc();
  return useQuery({
    ...utils.renewal.get.queryOptions({
      enabled: token !== null,
      input: { token: token ?? "" },
    }),
    refetchOnWindowFocus: false,
    retry: (count, error) => !isDefinedError(error) && count < 2,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export interface RenewalRequest {
  token: string;
  turnstileToken: string | null;
}

/**
 * "Pay": one `checkoutId` per page visit, so a double click or a retry
 * after a timeout answers the same open payment (ruling 5); `onRedirect`
 * sends the browser to Mollie. An `INVALID_STATE` answer (a settled or
 * failed attempt) takes a new id for the next try.
 */
export function useRenewalCheckout({
  onRedirect,
}: {
  onRedirect: (checkoutUrl: string) => void;
}) {
  const client = useSponsorshipsClient();
  const [checkoutId, setCheckoutId] = useState(() => crypto.randomUUID());
  const [redirecting, setRedirecting] = useRedirecting();
  const mutation = useMutation({
    mutationFn: async ({ token, turnstileToken }: RenewalRequest) =>
      await client.renewal.checkout(
        { checkoutId, token },
        { context: { turnstileToken: turnstileToken ?? undefined } }
      ),
    onError: (error: unknown) => {
      if (sponsorshipError(error)?.code === "INVALID_STATE") {
        setCheckoutId(crypto.randomUUID());
      }
    },
    onSuccess: (result) => {
      setRedirecting(true);
      onRedirect(result.checkoutUrl);
    },
  });
  return { ...mutation, redirecting };
}
