/**
 * What the sponsor wizard sends (S-01–S-11, ruling 5): the gestures, the
 * display name shown in the video, an optional logo, the contact and an
 * optional invoice request. The server validates it again, prices it with
 * `priceSponsorship` and compares `expectedTotalCents` only as a
 * consistency check (`PAYMENT_MISMATCH`).
 */
import {
  DISPLAY_NAME_MAX,
  LOCALES,
  MAX_GESTURES_PER_CHECKOUT,
} from "@smog/config/constants";
import { z } from "zod";
import { vatNumberSchema } from "./vat";

/** The old wizard's email check, kept on top of `z.email()`. */
const OLD_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An R2 logo key (`logos/<uuid>`), as `sponsorships.uploadLogo` issues it. */
export const LOGO_KEY_PATTERN = /^logos\/[0-9a-f-]{36}$/;

export const CONTACT_NAME_MAX = 120;
export const COMPANY_MAX = 120;
export const INVOICE_NAME_MAX = 160;
export const EMAIL_MAX = 254;

/** An email address: trimmed, ≤ 254, the old pattern and `z.email()`. */
export const contactEmailSchema = z
  .string()
  .trim()
  .pipe(z.email().max(EMAIL_MAX).regex(OLD_EMAIL_PATTERN));

/** No control characters or line breaks: the name is one line of video and email. */
const ONE_LINE = /^[^\p{Cc}\u2028\u2029]*$/u;

/** The sponsor line in the video (1..35 characters, trimmed, one line). */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(DISPLAY_NAME_MAX)
  .regex(ONE_LINE, { message: "controlCharacters" });

export const logoKeySchema = z.string().regex(LOGO_KEY_PATTERN);

/** Up to 10 distinct gesture ids. */
export const checkoutGestureIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(MAX_GESTURES_PER_CHECKOUT)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "duplicateGesture",
  });

export const contactSchema = z.object({
  /** Left out (or blank) for a private person. */
  company: z
    .string()
    .trim()
    .max(COMPANY_MAX)
    .optional()
    .transform((value) => (value ? value : undefined)),
  email: contactEmailSchema,
  name: z.string().trim().min(1).max(CONTACT_NAME_MAX),
});

/** The manual invoice request (ruling 3): no VAT is computed or shown. */
export const invoiceSchema = z.object({
  email: contactEmailSchema,
  name: z.string().trim().min(1).max(INVOICE_NAME_MAX),
  vatNumber: vatNumberSchema,
});

export const checkoutInputSchema = z.object({
  /** A v4 UUID the wizard makes once per run; it becomes `payment.id`. */
  checkoutId: z.uuid(),
  contact: contactSchema,
  displayName: displayNameSchema,
  /** The client's total in integer cents, only compared with the server's. */
  expectedTotalCents: z.number().int().nonnegative(),
  gestureIds: checkoutGestureIdsSchema,
  invoice: invoiceSchema.optional(),
  /** The sponsor's language (emails, the Mollie checkout). */
  locale: z.enum(LOCALES),
  /** The uploaded logo, or left out for none. */
  logoKey: logoKeySchema.optional(),
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
/** The form's values before parsing (the VAT number as typed). */
export type CheckoutFormInput = z.input<typeof checkoutInputSchema>;

/** What `sponsorships.checkout` (and `renewal.checkout`) answer. */
export const checkoutResultSchema = z.object({
  /** Mollie's hosted checkout: the wizard sends the browser there. */
  checkoutUrl: z.url(),
  /** Our payment id (the `checkoutId`), for `/sponsor/success?payment=`. */
  paymentId: z.uuid(),
});
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

/** The logo types the checkout accepts (ruling 10). */
export const LOGO_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

/** At most 2 MiB (ruling 10). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const uploadLogoInputSchema = z.object({
  contentType: z.enum(LOGO_CONTENT_TYPES),
  size: z.number().int().min(1).max(LOGO_MAX_BYTES),
});

/** A PUT the browser makes itself, with exactly these headers. */
export const uploadLogoResultSchema = z.object({
  /** Epoch ms after which the URL no longer works. */
  expiresAt: z.number().int(),
  headers: z.object({ "content-type": z.enum(LOGO_CONTENT_TYPES) }),
  key: logoKeySchema,
  uploadUrl: z.url(),
});
