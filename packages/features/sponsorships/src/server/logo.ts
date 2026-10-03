import {
  notImplemented,
  type SponsorshipsDeps,
  type SponsorshipsImplementer,
} from "./procedure";

/** `sponsorships.uploadLogo` (ruling 10): a stub until phase 6 task 4. */
export function logoProcedures(
  os: SponsorshipsImplementer,
  _deps: SponsorshipsDeps
) {
  return {
    uploadLogo: os.uploadLogo.handler(() => notImplemented()),
  };
}
