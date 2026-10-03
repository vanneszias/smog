// biome-ignore-all lint/performance/noBarrelFile: the `@smog/sponsorships/schema` entry point (client safe).
/**
 * `@smog/sponsorships/schema`: the wizard's input, the price, the BE VAT
 * check, the token hash, the status presentation and the I/O of every
 * public procedure. Client safe: no D1, no Mollie key.
 */
export {
  SPONSORSHIP_STATUSES,
  type SponsorshipEventType,
  type SponsorshipStatus,
} from "@smog/db/enums";
export {
  AVAILABILITY_IDS_MAX,
  AVAILABILITY_STATES,
  type Availability,
  type AvailabilityItem,
  type AvailabilityState,
  availabilityInputSchema,
  availabilityItemSchema,
  availabilitySchema,
  type Quote,
  quoteInputSchema,
  quoteSchema,
} from "./availability";
export {
  CANCEL_REASONS,
  MARK_PAID_NOTE_MAX,
  REFUND_REASONS,
  REJECTION_REASON_MAX,
  RENDER_ERROR_MAX,
  type RefundReason,
  SPONSORSHIP_EVENT_DATA_SCHEMAS,
  type SponsorshipEventData,
} from "./events";
export {
  type Price,
  type PriceInput,
  type PriceItem,
  priceSponsorship,
  SponsorshipPricingError,
} from "./pricing";
export {
  INVALID_STATE_REASONS,
  type InvalidStateReason,
  type PaymentStatusView,
  paymentStatusInputSchema,
  paymentStatusSchema,
  SPONSORSHIP_ERRORS,
  SPONSORSHIP_STATUS_LABEL_KEYS,
  SPONSORSHIP_STATUS_TONES,
  type SponsorshipStatusTone,
} from "./status";
export {
  hashSponsorshipToken,
  newSponsorshipToken,
  REEDIT_TOKEN_TTL_MS,
  reeditSchema,
  reeditSubmitInputSchema,
  renewalCheckoutInputSchema,
  renewalSchema,
  sponsorshipTokenSchema,
  tokenInputSchema,
} from "./tokens";
export { normalizeBelgianVat, vatNumberSchema } from "./vat";
export {
  type CheckoutFormInput,
  type CheckoutInput,
  type CheckoutResult,
  COMPANY_MAX,
  CONTACT_NAME_MAX,
  checkoutGestureIdsSchema,
  checkoutInputSchema,
  checkoutResultSchema,
  contactEmailSchema,
  contactSchema,
  displayNameSchema,
  EMAIL_MAX,
  INVOICE_NAME_MAX,
  invoiceSchema,
  LOGO_CONTENT_TYPES,
  LOGO_KEY_PATTERN,
  LOGO_MAX_BYTES,
  type LogoContentType,
  logoKeySchema,
  uploadLogoInputSchema,
  uploadLogoResultSchema,
} from "./wizard";
