/**
 * Task 6 (phase 6): the admin sponsorship schemas: the list, the detail,
 * the moderation and payment actions, and the CSV export (A-04–A-12, A-15,
 * A-29; rulings 4, 11 and 14). Everything exported here is part of
 * `@smog/admin/schema` (`index.ts` re-exports this file).
 *
 * Client-safe: the enums come from `@smog/db/enums` and the sponsorship
 * schema (no tables, no Mollie key).
 */
import {
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  RENDER_JOB_STATUSES,
  SPONSORSHIP_EVENT_TYPES,
  SPONSORSHIP_STATUSES,
  SPONSORSHIP_TOKEN_PURPOSES,
} from "@smog/db/enums";
import {
  INVALID_STATE_REASONS,
  MARK_PAID_NOTE_MAX,
  REJECTION_REASON_MAX,
} from "@smog/sponsorships/schema";
import { z } from "zod";

export const ADMIN_SPONSORSHIPS_PAGE_MAX = 100;
export const ADMIN_SPONSORSHIPS_PAGE_DEFAULT = 50;
/** The longest search text (as `admin.users`). */
export const SPONSORSHIP_QUERY_MAX = 200;
/** The export reads in keyset pages of this size (ruling 14). */
export const SPONSORSHIP_EXPORT_PAGE = 500;
/**
 * Over this many rows the export answers `INVALID_STATE tooMany` and asks
 * for a date range (ruling 14; there is no 10,000 row cap, bug 11).
 */
export const SPONSORSHIP_EXPORT_ROWS_MAX = 50_000;
/** At most this many sponsorships in the user panel (newest first). */
export const USER_SPONSORSHIPS_MAX = 100;

const idSchema = z.string().min(1).max(200);
const count = z.number().int().nonnegative();
const epochMs = z.number().int();
const sponsorshipStatusSchema = z.enum(SPONSORSHIP_STATUSES);
const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

/** A status filter: one or more statuses (each at most once). */
const statusFilterSchema = z
  .array(sponsorshipStatusSchema)
  .min(1)
  .max(SPONSORSHIP_STATUSES.length)
  .refine((statuses) => new Set(statuses).size === statuses.length, {
    message: "each status at most once",
  });

/** `from` and `to` (epoch ms, inclusive) on `created_at`, in order. */
function inOrder(input: { from?: number; to?: number }): boolean {
  return (
    input.from === undefined || input.to === undefined || input.from <= input.to
  );
}

const ORDER_MESSAGE = { message: "from must not be after to", path: ["to"] };

export const adminSponsorshipListInputSchema = z
  .object({
    cursor: z.string().min(1).max(1024).optional(),
    /** Created at or after (epoch ms). */
    from: z.number().int().nonnegative().optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(ADMIN_SPONSORSHIPS_PAGE_MAX)
      .default(ADMIN_SPONSORSHIPS_PAGE_DEFAULT),
    /** Only the sponsorships of this payment (ours, not Mollie's id). */
    paymentId: idSchema.optional(),
    /**
     * Part of the gesture name, the display name or the sponsor's email,
     * case-insensitive, taken literally (as `admin.users`).
     */
    q: z.string().trim().min(1).max(SPONSORSHIP_QUERY_MAX).optional(),
    /** Only those with a payment that needs the admin (`refundNeeded`). */
    refundNeeded: z.boolean().optional(),
    status: statusFilterSchema.optional(),
    /** Created at or before (epoch ms). */
    to: z.number().int().nonnegative().optional(),
  })
  .refine(inOrder, ORDER_MESSAGE);

export type AdminSponsorshipListInput = z.input<
  typeof adminSponsorshipListInputSchema
>;
/** The list input after defaults (`limit` set). */
export type AdminSponsorshipListQuery = z.output<
  typeof adminSponsorshipListInputSchema
>;

const gestureRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

/** One sponsorship as the list shows it. */
export const adminSponsorshipRowSchema = z.object({
  /** The checkout's item amount for this gesture (cents); `null` without one. */
  amountCents: z.number().int().nullable(),
  /** Epoch milliseconds. */
  createdAt: epochMs,
  displayName: z.string(),
  /** `null` until approved. */
  endsAt: epochMs.nullable(),
  gesture: gestureRefSchema,
  /** Whether a logo was bought (kept after the logo itself is purged). */
  hasLogo: z.boolean(),
  id: z.string(),
  invoiceRequested: z.boolean(),
  /** The checkout's payment status; `null` without one. */
  paymentStatus: paymentStatusSchema.nullable(),
  /**
   * The video to show (the review card's thumbnail): the sponsored video
   * once it exists, else the gesture's own (phase 6 task 7).
   */
  playbackId: z.string(),
  /**
   * A payment of this sponsorship needs the admin: `refund_needed` with no
   * refund recorded yet, or a chargeback while the sponsorship still holds
   * its gesture.
   */
  refundNeeded: z.boolean(),
  sponsor: z.object({
    company: z.string().nullable(),
    email: z.string(),
    name: z.string(),
  }),
  /** `null` until approved. */
  startsAt: epochMs.nullable(),
  status: sponsorshipStatusSchema,
  updatedAt: epochMs,
});

export type AdminSponsorshipRow = z.infer<typeof adminSponsorshipRowSchema>;

export const adminSponsorshipPageSchema = z.object({
  /** Per status, under the same filters except `status` (the tabs). */
  counts: z.record(sponsorshipStatusSchema, count),
  items: z.array(adminSponsorshipRowSchema),
  /** Pass as `cursor` for the next (older) page; `null` on the last. */
  nextCursor: z.string().nullable(),
});

export type AdminSponsorshipPage = z.infer<typeof adminSponsorshipPageSchema>;

/** One gesture of a payment, as its card lists them. */
const paymentItemSchema = z.object({
  amountCents: z.number().int(),
  gesture: gestureRefSchema,
  includesLogo: z.boolean(),
  sponsorshipId: z.string(),
  status: sponsorshipStatusSchema,
});

export const adminPaymentSchema = z.object({
  amountCents: z.number().int(),
  /** When a chargeback was first seen (epoch ms). */
  chargedBackAt: epochMs.nullable(),
  /** Mollie's `amountChargedBack` (cents). */
  chargedBackCents: z.number().int(),
  createdAt: epochMs,
  id: z.string(),
  /** Every gesture this payment covers (mark paid and cancel act on all). */
  items: z.array(paymentItemSchema),
  kind: z.enum(PAYMENT_KINDS),
  /** The payment's page in the Mollie dashboard; `null` without a Mollie id. */
  mollieDashboardUrl: z.url().nullable(),
  mollieId: z.string().nullable(),
  paidAt: epochMs.nullable(),
  /** Derived: `refunded_cents >= amount_cents` ("Refunded", ruling 4). */
  refunded: z.boolean(),
  refundedAt: epochMs.nullable(),
  refundedCents: z.number().int(),
  status: paymentStatusSchema,
});

export type AdminPayment = z.infer<typeof adminPaymentSchema>;

export const adminSponsorshipEventSchema = z.object({
  /** `null` for the system, or once the acting account is deleted. */
  actor: z.object({ id: z.string(), name: z.string() }).nullable(),
  createdAt: epochMs,
  /** As stored (validated per type by `@smog/sponsorships` on write). */
  data: z.unknown(),
  id: z.string(),
  type: z.enum(SPONSORSHIP_EVENT_TYPES),
});

export const adminRenderJobSchema = z.object({
  attempt: z.number().int(),
  createdAt: epochMs,
  error: z.string().nullable(),
  finishedAt: epochMs.nullable(),
  id: z.string(),
  playbackId: z.string().nullable(),
  status: z.enum(RENDER_JOB_STATUSES),
});

/** A re-edit or renewal link's state; never its hash (ruling 11). */
export const adminSponsorshipTokenSchema = z.object({
  createdAt: epochMs,
  expiresAt: epochMs,
  id: z.string(),
  purpose: z.enum(SPONSORSHIP_TOKEN_PURPOSES),
  usedAt: epochMs.nullable(),
});

/** The A-15 / A-29 detail. */
export const adminSponsorshipDetailSchema = z.object({
  events: z.array(adminSponsorshipEventSchema),
  gesture: gestureRefSchema.extend({
    /** The original video. */
    playbackId: z.string(),
  }),
  invoice: z
    .object({ email: z.string(), name: z.string(), vatNumber: z.string() })
    .nullable(),
  /** `/api/logos/<id>` (an admin read), or `null` without a logo. */
  logoUrl: z.string().nullable(),
  payments: z.array(adminPaymentSchema),
  renderJobs: z.array(adminRenderJobSchema),
  sponsor: z.object({
    company: z.string().nullable(),
    email: z.string(),
    locale: z.string(),
    name: z.string(),
  }),
  sponsorship: z.object({
    createdAt: epochMs,
    displayName: z.string(),
    endsAt: epochMs.nullable(),
    hasLogo: z.boolean(),
    id: z.string(),
    reminderSentAt: epochMs.nullable(),
    startsAt: epochMs.nullable(),
    status: sponsorshipStatusSchema,
    updatedAt: epochMs,
  }),
  tokens: z.array(adminSponsorshipTokenSchema),
  video: z.object({
    /**
     * The video is the gesture's own (the fake render of phase 6: "fake
     * render (no overlay)").
     */
    fakeRender: z.boolean(),
    playbackId: z.string().nullable(),
  }),
});

export type AdminSponsorshipDetail = z.infer<
  typeof adminSponsorshipDetailSchema
>;

/** Why a sponsorship action was refused (`INVALID_STATE` `data.reason`). */
export const sponsorshipInvalidStateDataSchema = z.object({
  reason: z.enum(INVALID_STATE_REASONS),
});

export const sponsorshipIdInputSchema = z.object({ id: idSchema });

export const rejectSponsorshipInputSchema = z.object({
  id: idSchema,
  reason: z.string().trim().min(1).max(REJECTION_REASON_MAX),
});

export const regenerateTokenInputSchema = z.object({
  id: idSchema,
  purpose: z.enum(SPONSORSHIP_TOKEN_PURPOSES),
});

export const markPaidInputSchema = z.object({
  /** The admin's note (a bank transfer reference), in the trail. */
  note: z.string().trim().min(1).max(MARK_PAID_NOTE_MAX).optional(),
  paymentId: idSchema,
});

export const paymentIdInputSchema = z.object({ paymentId: idSchema });

export const forceExpireInputSchema = z.object({
  /** Must equal the gesture's name (case-insensitive), else `VALIDATION`. */
  confirmName: z.string().trim().min(1).max(200),
  id: idSchema,
});

/** A sponsorship after a moderation action. */
export const sponsorshipActionResultSchema = z.object({
  id: z.string(),
  status: sponsorshipStatusSchema,
});

/**
 * The link the admin copies (shown once, A-07): never stored, logged or
 * audited; only its hash is kept.
 */
export const sponsorshipLinkResultSchema = z.object({
  expiresAt: epochMs,
  url: z.url(),
});

export const paymentActionResultSchema = z.object({
  paymentId: z.string(),
  /**
   * `marked_paid`: marked paid by hand; `settled`: Mollie already had the
   * money, so it was settled as the webhook does; `refund_needed`: Mollie
   * had it, but the settlement flagged the payment (an amount mismatch, a
   * gesture taken meanwhile); `canceled`: cancelled.
   */
  result: z.enum(["marked_paid", "settled", "refund_needed", "canceled"]),
  /** Every sponsorship of the payment. */
  sponsorshipIds: z.array(z.string()),
});

/** The job a retried render created (A-27): its id and attempt (≥ 2). */
export const retryRenderResultSchema = z.object({
  attempt: z.number().int().min(2),
  renderJobId: z.string(),
});

export const recordRefundResultSchema = z.object({
  amountCents: z.number().int(),
  paymentId: z.string(),
  refundedCents: z.number().int(),
});

export const sponsorshipsCsvInputSchema = z
  .object({
    from: z.number().int().nonnegative().optional(),
    status: statusFilterSchema.optional(),
    to: z.number().int().nonnegative().optional(),
  })
  .refine(inOrder, ORDER_MESSAGE);

export type SponsorshipsCsvInput = z.input<typeof sponsorshipsCsvInputSchema>;

export const sponsorshipsCsvSchema = z.object({
  csv: z.string(),
  /** `sponsorships-YYYY-MM-DD.csv` (the Brussels date). */
  filename: z.string(),
  rows: count,
});

export type SponsorshipsCsv = z.infer<typeof sponsorshipsCsvSchema>;

/**
 * The export's 18 columns in the old order (A-09), with `display_name` as
 * "Sponsor name" and the item amount.
 */
export const SPONSORSHIP_CSV_COLUMNS = [
  "ID",
  "Status",
  "Sponsor name",
  "Sponsor email",
  "Contact name",
  "Company",
  "Invoice name",
  "VAT number",
  "Invoice email",
  "Invoice requested",
  "Has logo",
  "Payment amount (€)",
  "Mollie payment ID",
  "Start date",
  "End date",
  "Duration (years)",
  "Gesture ID",
  "Created at",
] as const;

/** A sponsorship in the user panel (by the account's verified email). */
export const adminUserSponsorshipSchema = z.object({
  createdAt: epochMs,
  displayName: z.string(),
  gesture: gestureRefSchema,
  id: z.string(),
  status: sponsorshipStatusSchema,
});

/** The Mollie dashboard page of a payment (`tr_…`). */
export function mollieDashboardUrl(mollieId: string): string {
  return `https://my.mollie.com/dashboard/payments/${encodeURIComponent(mollieId)}`;
}

const LOGO_PREFIX = "logos/";

/**
 * The admin read of a stored logo (`logos/<uuid>` → `/api/logos/<uuid>`,
 * ruling 10).
 */
export function sponsorLogoUrl(logoKey: string): string {
  const id = logoKey.startsWith(LOGO_PREFIX)
    ? logoKey.slice(LOGO_PREFIX.length)
    : logoKey;
  return `/api/logos/${encodeURIComponent(id)}`;
}
