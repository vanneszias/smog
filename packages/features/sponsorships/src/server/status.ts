import {
  notImplemented,
  type SponsorshipsDeps,
  type SponsorshipsImplementer,
} from "./procedure";

/** `sponsorships.paymentStatus` (ruling 2): a stub until phase 6 task 4. */
export function statusProcedures(
  os: SponsorshipsImplementer,
  _deps: SponsorshipsDeps
) {
  return {
    paymentStatus: os.paymentStatus.handler(() => notImplemented()),
  };
}
