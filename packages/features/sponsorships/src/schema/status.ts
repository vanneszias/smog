/**
 * How a sponsorship status reads (ruling 15) and the typed error data the
 * sponsorship procedures answer with. One label map and one tone map: the
 * admin `StatusBadge` and the success page use them, so no colour or label
 * is written twice. The tones are the kit `Badge` variants (the ruling's
 * "info" is the kit's `primary`).
 */
import {
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  type SponsorshipStatus,
} from "@smog/db/enums";
import type { TranslationKey } from "@smog/i18n";
import { MOLLIE_PAYMENT_ID } from "@smog/payments/schema";
import { z } from "zod";

export const SPONSORSHIP_STATUS_LABEL_KEYS = {
  awaiting_payment: "sponsorship.status.awaiting_payment",
  cancelled: "sponsorship.status.cancelled",
  changes_requested: "sponsorship.status.changes_requested",
  expired: "sponsorship.status.expired",
  expiring: "sponsorship.status.expiring",
  in_review: "sponsorship.status.in_review",
  live: "sponsorship.status.live",
  rejected: "sponsorship.status.rejected",
  render_failed: "sponsorship.status.render_failed",
  rendering: "sponsorship.status.rendering",
} as const satisfies Record<SponsorshipStatus, TranslationKey>;

/** The kit `Badge` variants. */
export type SponsorshipStatusTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger";

export const SPONSORSHIP_STATUS_TONES = {
  awaiting_payment: "primary",
  cancelled: "neutral",
  changes_requested: "accent",
  expired: "neutral",
  expiring: "warning",
  in_review: "warning",
  live: "success",
  rejected: "danger",
  render_failed: "danger",
  rendering: "neutral",
} as const satisfies Record<SponsorshipStatus, SponsorshipStatusTone>;

/**
 * Why a sponsorship call answered `INVALID_STATE` (copy under
 * `sponsorship.errors.<reason>`):
 * - `stale`: the row changed since it was read (a lost race; the guard).
 * - `paymentsUnavailable`: no `MOLLIE_API_KEY`, sponsoring is paused.
 * - `paymentProvider`: Mollie failed while creating the payment.
 * - `alreadySettled`: a repeated checkout whose payment is no longer open.
 * - `logoInvalid`: the uploaded logo is missing, too large or not an image.
 * - `logoExpired`: a re-edit's upload is gone (an upload no sponsorship
 *   references is purged after 24 h): upload it again.
 * - `noLogo`: a re-edit sent a logo for a sponsorship without one.
 * - `notRenewable`: the sponsorship can no longer be renewed.
 * - `gestureTaken`: a request for changes on a rejected sponsorship whose
 *   gesture was sponsored again (the partial unique index).
 * - `noVideo`: approve before the video exists.
 * - `paid`: cancel of a payment Mollie reports paid.
 * - `notRefunded`: record a refund Mollie does not report.
 * - `tooMany`: an export over 50,000 rows.
 */
export const INVALID_STATE_REASONS = [
  "stale",
  "paymentsUnavailable",
  "paymentProvider",
  "alreadySettled",
  "logoInvalid",
  "logoExpired",
  "noLogo",
  "notRenewable",
  "gestureTaken",
  "noVideo",
  "paid",
  "notRefunded",
  "tooMany",
] as const;
export type InvalidStateReason = (typeof INVALID_STATE_REASONS)[number];

/**
 * Each `INVALID_STATE` reason's copy (`sponsorship.errors.*`): the sponsor
 * pages and the admin screens both read this one map (review M-7).
 */
export const INVALID_STATE_REASON_KEYS = {
  alreadySettled: "sponsorship.errors.alreadySettled",
  gestureTaken: "sponsorship.errors.gestureTaken",
  logoExpired: "sponsorship.errors.logoExpired",
  logoInvalid: "sponsorship.errors.logoInvalid",
  noLogo: "sponsorship.errors.noLogo",
  notRefunded: "sponsorship.errors.notRefunded",
  notRenewable: "sponsorship.errors.notRenewable",
  noVideo: "sponsorship.errors.noVideo",
  paid: "sponsorship.errors.paid",
  paymentProvider: "sponsorship.errors.paymentProvider",
  paymentsUnavailable: "sponsorship.errors.paymentsUnavailable",
  stale: "sponsorship.errors.stale",
  tooMany: "sponsorship.errors.tooMany",
} as const satisfies Record<InvalidStateReason, TranslationKey>;

/**
 * The sponsorship errors with their data, on top of the shared map
 * (`baseContract.errors(SPONSORSHIP_ERRORS)`).
 */
export const SPONSORSHIP_ERRORS = {
  /** The gestures that are taken, unpublished or unknown (ruling 5). */
  GESTURE_UNAVAILABLE: {
    data: z.object({ gestureIds: z.array(z.string()) }),
    status: 409,
  },
  INVALID_STATE: {
    data: z.object({ reason: z.enum(INVALID_STATE_REASONS) }),
    status: 409,
  },
  /** When the link expired (epoch ms), for the page's message (ruling 11). */
  TOKEN_EXPIRED: {
    data: z.object({ expiresAt: z.number().int() }),
    status: 410,
  },
} as const;

/** `sponsorships.paymentStatus` takes our id or Mollie's (`tr_…`). */
export const paymentStatusInputSchema = z.object({
  payment: z.union([z.uuid(), z.string().regex(MOLLIE_PAYMENT_ID)]),
});

/**
 * What the success page may show (S-14): no email, contact, company,
 * invoice or Mollie data.
 */
export const paymentStatusSchema = z.object({
  displayName: z.string(),
  items: z.array(
    z.object({
      gestureName: z.string(),
      gestureSlug: z.string(),
      includesLogo: z.boolean(),
    })
  ),
  kind: z.enum(PAYMENT_KINDS),
  /** For a paid renewal: the new end, epoch ms. */
  renewedUntil: z.number().int().optional(),
  status: z.enum(PAYMENT_STATUSES),
  totalCents: z.number().int(),
});
export type PaymentStatusView = z.infer<typeof paymentStatusSchema>;

/**
 * The reason in an `INVALID_STATE` error's `data`, else `null` (a missing
 * or unknown reason). The callers check the code first.
 */
export function invalidStateReasonOf(data: unknown): InvalidStateReason | null {
  const parsed = SPONSORSHIP_ERRORS.INVALID_STATE.data.safeParse(data);
  return parsed.success ? parsed.data.reason : null;
}
