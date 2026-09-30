// biome-ignore-all lint/performance/noBarrelFile: the `@smog/account/client` entry point (site + mobile).
/**
 * `@smog/account/client`: the account hooks for both apps (profile,
 * consent, export, deletion) and the guest data import after sign-in or
 * sign-up (spec §11). Platform-neutral; the apps render the screens.
 * Never imports ./server.
 */
export {
  type AccountSlice,
  countGuestData,
  type ImportGuestDataOptions,
  importGuestData,
} from "./import-guest-data";
export {
  type AccountActionError,
  type AccountActionResult,
  accountActionError,
  accountActionMessage,
  canUnlink,
  linkedAccountCount,
} from "./sign-in-methods";
export { type Account, type AccountStatus, useAccount } from "./use-account";
export {
  type Consent,
  type ConsentChoice,
  type ConsentStatus,
  useConsent,
  useConsentChoice,
} from "./use-consent";
export {
  type DeleteAccount,
  type DeleteAccountFailure,
  type DeleteAccountStatus,
  deleteFailureMessage,
  type UseDeleteAccountOptions,
  useDeleteAccount,
} from "./use-delete-account";
export {
  type Export,
  type ExportStatus,
  exportFileName,
  serializeExport,
  useExport,
} from "./use-export";
export {
  type GuestImport,
  type GuestImportCounts,
  type GuestImportStatus,
  useGuestImport,
} from "./use-guest-import";
export {
  type Passkey,
  type Passkeys,
  type PasskeysClient,
  type PasskeysStatus,
  usePasskeys,
} from "./use-passkeys";
export {
  type ChangePasswordInput,
  type LinkOptions,
  type SignInMethodAction,
  type SignInMethodsActions,
  type SignInMethodsClient,
  useSignInMethods,
} from "./use-sign-in-methods";
