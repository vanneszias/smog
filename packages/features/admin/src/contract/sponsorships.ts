import { baseContract } from "@smog/rpc/contract";
import {
  adminSponsorshipDetailSchema,
  adminSponsorshipListInputSchema,
  adminSponsorshipPageSchema,
  forceExpireInputSchema,
  markPaidInputSchema,
  paymentActionResultSchema,
  paymentIdInputSchema,
  recordRefundResultSchema,
  regenerateTokenInputSchema,
  rejectSponsorshipInputSchema,
  retryRenderResultSchema,
  sponsorshipActionResultSchema,
  sponsorshipIdInputSchema,
  sponsorshipInvalidStateDataSchema,
  sponsorshipLinkResultSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";

/**
 * A refused sponsorship action's `INVALID_STATE`, with its reason
 * (`stale` for a status that moved on or a lost race, `noVideo`,
 * `gestureTaken`, `paid`, `notRefunded`, `paymentProvider`, …; the copy is
 * `sponsorship.errors.<reason>`).
 */
const SPONSORSHIPS_ERRORS = {
  INVALID_STATE: { data: sponsorshipInvalidStateDataSchema, status: 409 },
} as const;

const sponsorshipsContract = baseContract.errors(SPONSORSHIPS_ERRORS);

/**
 * `admin.sponsorships.*`: moderation, the list and detail, the payment
 * actions (A-04–A-08, A-10–A-12, A-15, A-29; ruling 14). Reads come from
 * D1. Every action runs the guarded batch of `@smog/sponsorships` (injected
 * as `AdminDeps.sponsorships`) with its audit entry in the **same** batch,
 * so the change, its `sponsorship_event` and its entry land together or
 * not at all; a lost race is `INVALID_STATE stale`. Emails and the
 * `payment.settled` fan-out are enqueued after the batch (ruling 8).
 * `NOT_FOUND` for an unknown sponsorship or payment.
 */
export const sponsorshipsSlice = {
  sponsorships: {
    /**
     * Approve (A-05): only `in_review` with a video. Live for 365 days from
     * now; `sponsorship_live` goes to the sponsor with the stored dates.
     */
    approve: sponsorshipsContract
      .input(sponsorshipIdInputSchema)
      .output(sponsorshipActionResultSchema),
    /**
     * Cancel (A-11) the whole payment, only while `open`. Mollie is asked
     * first: a payment Mollie reports paid is settled instead and answers
     * `INVALID_STATE paid`.
     */
    cancel: sponsorshipsContract
      .input(paymentIdInputSchema)
      .output(paymentActionResultSchema),
    /**
     * Force expire (A-12) from `live`/`expiring`, behind the typed gesture
     * name (`VALIDATION` on a mismatch). The sponsored Mux asset is deleted
     * after the batch, as the expiry sweep does.
     */
    forceExpire: sponsorshipsContract
      .input(forceExpireInputSchema)
      .output(sponsorshipActionResultSchema),
    /**
     * The detail (A-15, A-29): the sponsorship, gesture, video, sponsor,
     * invoice, payments (with chargebacks and refunds), the trail with its
     * actors, the render jobs and the tokens (never a hash).
     */
    get: baseContract
      .input(sponsorshipIdInputSchema)
      .output(adminSponsorshipDetailSchema),
    /**
     * Newest first (`created_at, id` keyset), filtered by status, `q`,
     * payment, `refundNeeded` and the creation date; `counts` per status
     * for the tabs.
     */
    list: baseContract
      .input(adminSponsorshipListInputSchema)
      .output(adminSponsorshipPageSchema),
    /**
     * Mark paid by hand (A-10, a bank transfer) for the whole payment, only
     * while `open`. Mollie is asked first: already paid settles normally;
     * otherwise it is cancelled there when it can be. Every gesture goes to
     * `rendering` and `payment.settled` follows (bug 32).
     */
    markPaid: sponsorshipsContract
      .input(markPaidInputSchema)
      .output(paymentActionResultSchema),
    /**
     * Record a refund made in the Mollie dashboard (ruling 4): Mollie's
     * `amountRefunded` is stored; `INVALID_STATE notRefunded` when Mollie
     * reports none, `paymentsUnavailable` without a Mollie key.
     */
    recordRefund: sponsorshipsContract
      .input(paymentIdInputSchema)
      .output(recordRefundResultSchema),
    /**
     * A new link for a lost one (ruling 11): re-edit while
     * `changes_requested`, renewal while `expiring`. The open links of that
     * purpose stop working. The URL is shown once.
     */
    regenerateToken: sponsorshipsContract
      .input(regenerateTokenInputSchema)
      .output(sponsorshipLinkResultSchema),
    /** Reject (A-06) from `in_review`/`changes_requested`, with a reason. */
    reject: sponsorshipsContract
      .input(rejectSponsorshipInputSchema)
      .output(sponsorshipActionResultSchema),
    /**
     * Request changes (A-07) from `in_review`/`rejected`: a 7 day re-edit
     * link (the open ones stop working), shown once for the admin to copy.
     * No email goes to the sponsor (parity).
     */
    requestChanges: sponsorshipsContract
      .input(sponsorshipIdInputSchema)
      .output(sponsorshipLinkResultSchema),
    /**
     * Retry a failed render (A-27), only from `render_failed`: back to
     * `rendering` (`render_retried`) with the next render job (`attempt +
     * 1`), its `render_started` and the audit entry in one batch; then
     * `render.requested` is enqueued (a lost message is re-sent by the
     * hourly render watchdog). `INVALID_STATE stale` for any other status
     * or a lost race.
     */
    retryRender: sponsorshipsContract
      .input(sponsorshipIdInputSchema)
      .output(retryRenderResultSchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "sponsorships.approve": { audit: "sponsorship.approve" },
  "sponsorships.cancel": { audit: "sponsorship.cancel" },
  "sponsorships.forceExpire": { audit: "sponsorship.force_expire" },
  "sponsorships.get": "read",
  "sponsorships.list": "read",
  "sponsorships.markPaid": { audit: "sponsorship.mark_paid" },
  "sponsorships.recordRefund": { audit: "payment.refund" },
  "sponsorships.regenerateToken": { audit: "sponsorship.regenerate_token" },
  "sponsorships.reject": { audit: "sponsorship.reject" },
  "sponsorships.requestChanges": { audit: "sponsorship.request_changes" },
  "sponsorships.retryRender": { audit: "sponsorship.retry_render" },
} as const satisfies AdminProcedures<typeof sponsorshipsSlice>;
