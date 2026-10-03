// biome-ignore-all lint/performance/noBarrelFile: the `@smog/sponsorships/client` entry point (site + mobile).
/**
 * `@smog/sponsorships/client`: platform-neutral hooks over the typed
 * `sponsorships` slice: availability and quote, the wizard (reducer,
 * details check, checkout), the logo upload, the payment status poll, the
 * re-edit and the renewal. Never imports ./server.
 */
export {
  AVAILABILITY_STALE_TIME,
  normalizeGestureIds,
  type SponsorshipsClient,
  type SponsorshipsQueryUtils,
  sponsorshipError,
  useSponsorshipsClient,
  useSponsorshipsRpc,
} from "./slice";
export { availabilityOptions, useAvailability } from "./use-availability";
export {
  type CheckoutRequest,
  checkoutInput,
  createWizardState,
  type DetailsError,
  type DetailsErrors,
  type DetailsField,
  displayNameError,
  EMPTY_DETAILS,
  type PreselectGesture,
  type UseCheckoutOptions,
  useCheckout,
  useRedirecting,
  useWizard,
  validateDetails,
  type WizardAction,
  type WizardDetails,
  type WizardGesture,
  type WizardState,
  type WizardStep,
  wizardPrice,
  wizardReducer,
} from "./use-checkout";
export {
  type LogoFile,
  type LogoFileError,
  LogoUploadError,
  logoFileError,
  uploadLogoFile,
  useLogoUpload,
} from "./use-logo-upload";
export {
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_MAX_ATTEMPTS,
  paymentParam,
  type UsePaymentStatusOptions,
  usePaymentStatus,
} from "./use-payment-status";
export { quoteOptions, useQuote } from "./use-quote";
export {
  type ReeditRequest,
  tokenParam,
  useReedit,
  useReeditSubmit,
} from "./use-reedit";
export {
  type RenewalRequest,
  useRenewal,
  useRenewalCheckout,
} from "./use-renewal";
export {
  type SponsorCtaGesture,
  type SponsorCtaOptions,
  type SponsorCtaView,
  useSponsorCta,
} from "./use-sponsor-cta";
