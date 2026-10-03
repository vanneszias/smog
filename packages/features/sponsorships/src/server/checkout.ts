import {
  notImplemented,
  type SponsorshipsDeps,
  type SponsorshipsImplementer,
} from "./procedure";

/** `sponsorships.checkout` (ruling 5): a stub until phase 6 task 4. */
export function checkoutProcedures(
  os: SponsorshipsImplementer,
  _deps: SponsorshipsDeps
) {
  return {
    checkout: os.checkout.handler(() => notImplemented()),
  };
}
