// biome-ignore-all lint/performance/noBarrelFile: the `@smog/sponsorships/client` entry point (site + mobile).
/**
 * `@smog/sponsorships/client`: platform-neutral hooks over the typed
 * `sponsorships` slice. Never imports ./server. Phase 6 task 8 adds the
 * wizard, payment status, re-edit, renewal and logo upload hooks in their
 * own files (`use-checkout.ts`, …).
 */
export {
  AVAILABILITY_STALE_TIME,
  normalizeGestureIds,
  type SponsorshipsQueryUtils,
  useSponsorshipsRpc,
} from "./slice";
export { availabilityOptions, useAvailability } from "./use-availability";
export { quoteOptions, useQuote } from "./use-quote";
