/**
 * `sponsorship_event.data` per event type (spec §5.4: "Zod per type"), as
 * the audit writer does for `audit_log`: every schema is strict, so an
 * unknown key is refused before anything is written. Dates are ISO 8601
 * strings (the column is JSON). `legacy` holds migrated rows and is never
 * written by the app.
 */
import {
  SPONSORSHIP_TOKEN_PURPOSES,
  type SponsorshipEventType,
} from "@smog/db/enums";
import { z } from "zod";

/** A rejection reason, in the event and the audit entry (ruling 14). */
export const REJECTION_REASON_MAX = 500;
/** A render error summary (no stack), as the admin email shows it. */
export const RENDER_ERROR_MAX = 300;
/** The admin's note on a payment marked paid by hand (ruling 14). */
export const MARK_PAID_NOTE_MAX = 200;

const paymentRef = { paymentId: z.string().min(1) };
const iso = z.iso.datetime();

/** Why a sponsorship was cancelled (`cancelled` event). */
export const CANCEL_REASONS = [
  /** Mollie failed while the checkout created the payment (ruling 5). */
  "provider",
  /** An admin cancelled the payment (ruling 14). */
  "admin",
  /** The 24 h stale sweep (ruling 9). */
  "stale",
  /** Mollie's amount or currency did not match ours (ruling 6). */
  "mismatch",
] as const;

/** Why a payment needs a refund by hand (ruling 4). */
export const REFUND_REASONS = ["late", "mismatch", "double"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const SPONSORSHIP_EVENT_DATA_SCHEMAS = {
  approved: z.strictObject({ endsAt: iso, startsAt: iso }),
  cancelled: z.strictObject({
    paymentId: z.string().min(1).optional(),
    reason: z.enum(CANCEL_REASONS),
  }),
  changes_requested: z.strictObject({ expiresAt: iso, tokenId: z.string() }),
  created: z.strictObject(paymentRef),
  expired: z.strictObject({}),
  force_expired: z.strictObject({}),
  legacy: z.record(z.string(), z.unknown()),
  marked_paid_manually: z.strictObject({
    ...paymentRef,
    note: z.string().trim().min(1).max(MARK_PAID_NOTE_MAX).optional(),
  }),
  payment_failed: z.strictObject({
    ...paymentRef,
    status: z.enum(["failed", "canceled", "expired"]),
  }),
  payment_paid: z.strictObject(paymentRef),
  refund_needed: z.strictObject({
    ...paymentRef,
    reason: z.enum(REFUND_REASONS),
  }),
  rejected: z.strictObject({
    reason: z.string().trim().min(1).max(REJECTION_REASON_MAX),
  }),
  reminder_sent: z.strictObject({ endsAt: iso }),
  render_failed: z.strictObject({
    error: z.string().max(RENDER_ERROR_MAX),
    renderJobId: z.string(),
  }),
  render_retried: z.strictObject({}),
  render_started: z.strictObject({
    attempt: z.number().int().min(1),
    renderJobId: z.string(),
  }),
  render_succeeded: z.strictObject({ renderJobId: z.string() }),
  renewed: z.strictObject({
    ...paymentRef,
    endsAt: iso,
    manual: z.boolean().optional(),
  }),
  resubmitted: z.strictObject({
    displayNameChanged: z.boolean(),
    logoChanged: z.boolean(),
  }),
  revived: z.strictObject(paymentRef),
  token_issued: z.strictObject({
    expiresAt: iso,
    purpose: z.enum(SPONSORSHIP_TOKEN_PURPOSES),
    tokenId: z.string(),
  }),
} as const satisfies Record<SponsorshipEventType, z.ZodType>;

export type SponsorshipEventData<T extends SponsorshipEventType> = z.input<
  (typeof SPONSORSHIP_EVENT_DATA_SCHEMAS)[T]
>;
