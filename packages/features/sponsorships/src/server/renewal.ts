import {
  notImplemented,
  type SponsorshipsDeps,
  type SponsorshipsImplementer,
} from "./procedure";

/** `sponsorships.renewal.*` (ruling 11): stubs until phase 6 task 5. */
export function renewalProcedures(
  os: SponsorshipsImplementer,
  _deps: SponsorshipsDeps
) {
  return {
    renewal: {
      checkout: os.renewal.checkout.handler(() => notImplemented()),
      get: os.renewal.get.handler(() => notImplemented()),
    },
  };
}
