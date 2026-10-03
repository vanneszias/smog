/**
 * Mollie's payment, as `@smog/payments` returns it (client safe: no key,
 * no fetch). The API's answer (`mollieApiPaymentSchema`) is parsed into
 * `MolliePayment`, with amounts in integer cents (`mollieValueToCents`).
 */
import { z } from "zod";
import { mollieValueToCents } from "./money";

/** Every status of a Mollie v2 payment. */
export const MOLLIE_PAYMENT_STATUSES = [
  "open",
  "pending",
  "authorized",
  "paid",
  "canceled",
  "expired",
  "failed",
] as const;
export type MolliePaymentStatus = (typeof MOLLIE_PAYMENT_STATUSES)[number];

/** A Mollie payment id (`tr_…`), as the webhook validates it (ruling 2). */
export const MOLLIE_PAYMENT_ID = /^tr_[A-Za-z0-9]{4,64}$/;

/** The payment as the rest of SMOG reads it. */
export const molliePaymentSchema = z.object({
  /** The amount in integer cents. */
  amountCents: z.number().int().nonnegative(),
  /**
   * Mollie's `amountChargedBack` in cents (0 without a chargeback). A
   * chargeback keeps the status `paid` (phase 6 task 3 fix round 1, I-3).
   */
  amountChargedBackCents: z.number().int().nonnegative(),
  /** Mollie's `amountRefunded` in cents (0 when nothing is refunded). */
  amountRefundedCents: z.number().int().nonnegative(),
  /** The hosted checkout (`_links.checkout.href`), while it is payable. */
  checkoutUrl: z.url().optional(),
  createdAt: z.date(),
  currency: z.string().length(3),
  /** The payment's page in the Mollie dashboard (`_links.dashboard.href`). */
  dashboardUrl: z.url().optional(),
  id: z.string().regex(MOLLIE_PAYMENT_ID),
  isCancelable: z.boolean(),
  /** What we sent (`{ paymentId, kind }`), or `null`. */
  metadata: z.record(z.string(), z.unknown()).nullable(),
  paidAt: z.date().optional(),
  status: z.enum(MOLLIE_PAYMENT_STATUSES),
});
export type MolliePayment = z.infer<typeof molliePaymentSchema>;

const amountSchema = z.object({
  currency: z.string().length(3),
  value: z.string(),
});

const linkSchema = z.object({ href: z.url() }).nullish();

/** `GET /v2/payments/{id}` (and the create and cancel answers), raw. */
export const mollieApiPaymentSchema = z
  .object({
    _links: z
      .object({ checkout: linkSchema, dashboard: linkSchema })
      .partial()
      .nullish(),
    amount: amountSchema,
    amountChargedBack: amountSchema.nullish(),
    amountRefunded: amountSchema.nullish(),
    createdAt: z.iso.datetime({ offset: true }),
    id: z.string().regex(MOLLIE_PAYMENT_ID),
    isCancelable: z.boolean().nullish(),
    metadata: z.unknown().nullish(),
    paidAt: z.iso.datetime({ offset: true }).nullish(),
    status: z.enum(MOLLIE_PAYMENT_STATUSES),
  })
  .transform((raw, context): MolliePayment => {
    let amountCents = 0;
    let amountRefundedCents = 0;
    let amountChargedBackCents = 0;
    try {
      amountCents = mollieValueToCents(raw.amount.value);
      amountRefundedCents = raw.amountRefunded
        ? mollieValueToCents(raw.amountRefunded.value)
        : 0;
      amountChargedBackCents = raw.amountChargedBack
        ? mollieValueToCents(raw.amountChargedBack.value)
        : 0;
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : String(error),
        path: ["amount"],
      });
      return z.NEVER;
    }
    const metadata =
      typeof raw.metadata === "object" &&
      raw.metadata !== null &&
      !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null;
    const checkoutUrl = raw._links?.checkout?.href;
    const dashboardUrl = raw._links?.dashboard?.href;
    return {
      amountCents,
      amountChargedBackCents,
      amountRefundedCents,
      createdAt: new Date(raw.createdAt),
      currency: raw.amount.currency,
      id: raw.id,
      isCancelable: raw.isCancelable ?? false,
      metadata,
      status: raw.status,
      ...(checkoutUrl ? { checkoutUrl } : {}),
      ...(dashboardUrl ? { dashboardUrl } : {}),
      ...(raw.paidAt ? { paidAt: new Date(raw.paidAt) } : {}),
    };
  });
