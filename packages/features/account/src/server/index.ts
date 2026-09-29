// biome-ignore-all lint/performance/noBarrelFile: the `@smog/account/server` entry point (Worker only).
export { getConsent, setConsent } from "./consent";
export {
  type DeleteAccountDeps,
  DeleteAccountError,
  deleteAccount,
} from "./delete";
export { type ExportDeps, exportAccount, type ShareUrl } from "./export";
export { type ImportDeps, importGuestData } from "./import";
export { AccountNotFoundError, getMe, updateProfile } from "./profile";
export {
  type AccountRouter,
  type AccountRouterDeps,
  createAccountRouter,
} from "./router";
