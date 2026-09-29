// biome-ignore-all lint/performance/noBarrelFile: the `@smog/account/client` entry point (site + mobile).
/**
 * `@smog/account/client`: the guest data import after sign-in or sign-up
 * (spec §11). Platform-neutral; the apps render the sheet. Never imports
 * ./server.
 */
export {
  type AccountSlice,
  countGuestData,
  type ImportGuestDataOptions,
  importGuestData,
} from "./import-guest-data";
export {
  type GuestImport,
  type GuestImportCounts,
  type GuestImportStatus,
  useGuestImport,
} from "./use-guest-import";
