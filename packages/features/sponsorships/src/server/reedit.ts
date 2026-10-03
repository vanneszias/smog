import {
  notImplemented,
  type SponsorshipsDeps,
  type SponsorshipsImplementer,
} from "./procedure";

/** `sponsorships.reedit.*` (ruling 11): stubs until phase 6 task 5. */
export function reeditProcedures(
  os: SponsorshipsImplementer,
  _deps: SponsorshipsDeps
) {
  return {
    reedit: {
      get: os.reedit.get.handler(() => notImplemented()),
      submit: os.reedit.submit.handler(() => notImplemented()),
    },
  };
}
