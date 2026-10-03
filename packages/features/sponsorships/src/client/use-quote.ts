import { MAX_GESTURES_PER_CHECKOUT } from "@smog/config/constants";
import { useQuery } from "@tanstack/react-query";
import {
  AVAILABILITY_STALE_TIME,
  normalizeGestureIds,
  type SponsorshipsQueryUtils,
  useSponsorshipsRpc,
} from "./slice";

export function quoteOptions(
  utils: SponsorshipsQueryUtils,
  input: { gestureIds: readonly string[]; logo: boolean }
) {
  const ids = normalizeGestureIds(input.gestureIds);
  return utils.quote.queryOptions({
    enabled: ids.length > 0 && ids.length <= MAX_GESTURES_PER_CHECKOUT,
    input: { gestureIds: ids, logo: input.logo },
    staleTime: AVAILABILITY_STALE_TIME,
  });
}

/**
 * The server's price for a selection and its unavailable gestures. The
 * wizard shows `priceSponsorship` at once (the same function) and uses
 * this to confirm before paying. Disabled for 0 or more than 10 gestures.
 */
export function useQuote(input: {
  gestureIds: readonly string[];
  logo: boolean;
}) {
  return useQuery(quoteOptions(useSponsorshipsRpc(), input));
}
