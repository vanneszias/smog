import { useQuery } from "@tanstack/react-query";
import { AVAILABILITY_IDS_MAX } from "../schema/availability";
import {
  AVAILABILITY_STALE_TIME,
  normalizeGestureIds,
  type SponsorshipsQueryUtils,
  useSponsorshipsRpc,
} from "./slice";

/**
 * The query options of `useAvailability`, for SSR loaders too
 * (`queryClient.ensureQueryData(availabilityOptions(utils, ids))`).
 */
export function availabilityOptions(
  utils: SponsorshipsQueryUtils,
  gestureIds: readonly string[]
) {
  const ids = normalizeGestureIds(gestureIds);
  return utils.availability.queryOptions({
    enabled: ids.length > 0 && ids.length <= AVAILABILITY_IDS_MAX,
    input: { gestureIds: ids },
    staleTime: AVAILABILITY_STALE_TIME,
  });
}

/**
 * Whether each gesture can be sponsored (the wizard's cards, the gesture
 * CTA) and whether checkout is on. Disabled for an empty list.
 */
export function useAvailability(gestureIds: readonly string[]) {
  return useQuery(availabilityOptions(useSponsorshipsRpc(), gestureIds));
}
