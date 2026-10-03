/**
 * The admin's sponsorship operations as batch builders (rulings 1 and
 * 14): each reads what it needs, checks the status, and returns the
 * statements of one D1 batch plus what to enqueue after it (`after`).
 * `@smog/admin` gets them through `AdminDeps.sponsorships` and appends its
 * `auditStatement` to the same batch, so the change, its
 * `sponsorship_event` and its audit entry land together or not at all.
 * Every status change is a guarded `transitionStatements`, and every
 * payment change a `paymentGuard`: a lost race fails the batch
 * (`isStaleTransition` / `isStalePayment`), which the admin answers as
 * `INVALID_STATE stale`.
 */
import { SPONSORSHIP_DURATION_DAYS } from "@smog/config/constants";
import {
  failWhen,
  gesture,
  type PaymentKind,
  type PaymentStatus,
  payment,
  paymentItem,
  type SponsorshipStatus,
  type SponsorshipTokenPurpose,
  type Statement,
  sponsor,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import type { OutboxEmail } from "@smog/email";
import type { EventMessage } from "@smog/jobs";
import type { MolliePayment } from "@smog/payments";
import { DAY_MS } from "@smog/utils";
import { asc, eq, sql } from "drizzle-orm";
import type { InvalidStateReason } from "../schema/status";
import { REEDIT_TOKEN_TTL_MS } from "../schema/tokens";
import { isRenewable, renewStatements } from "./settle";
import {
  issueTokenStatements,
  paymentGuard,
  refundStatement,
} from "./statements";
import { STALE_GUARD, transitionStatements } from "./transition";

/** Something to enqueue once the batch committed (ruling 8). */
export type AfterCommit =
  | { email: OutboxEmail; kind: "email" }
  | { event: EventMessage; kind: "event" };

export interface LifecyclePlan {
  after: AfterCommit[];
  statements: Statement[];
}

/**
 * The operation does not apply: `notFound`, or an `INVALID_STATE` reason
 * (`stale` for a status that does not allow it, `noVideo`, `notRefunded`).
 */
export class SponsorshipActionError extends Error {
  readonly reason: InvalidStateReason | "notFound";

  constructor(reason: InvalidStateReason | "notFound", message: string) {
    super(`[sponsorships] ${message}`);
    this.reason = reason;
    this.name = "SponsorshipActionError";
  }
}

const DURATION_MS = SPONSORSHIP_DURATION_DAYS * DAY_MS;

interface SponsorshipView {
  displayName: string;
  endsAt: Date | null;
  gestureMuxAssetId: string | null;
  gestureName: string;
  gestureSlug: string;
  id: string;
  sponsorEmail: string;
  sponsorLocale: "nl" | "en" | "fr";
  sponsorName: string;
  status: SponsorshipStatus;
  videoAssetId: string | null;
  videoPlaybackId: string | null;
}

async function readSponsorship(
  db: Db,
  sponsorshipId: string
): Promise<SponsorshipView> {
  const [row] = await db
    .select({
      displayName: sponsorship.displayName,
      endsAt: sponsorship.endsAt,
      gestureMuxAssetId: gesture.muxAssetId,
      gestureName: gesture.name,
      gestureSlug: gesture.slug,
      id: sponsorship.id,
      sponsorEmail: sponsor.email,
      sponsorLocale: sponsor.locale,
      sponsorName: sponsor.name,
      status: sponsorship.status,
      videoAssetId: sponsorship.videoAssetId,
      videoPlaybackId: sponsorship.videoPlaybackId,
    })
    .from(sponsorship)
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .innerJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
    .where(eq(sponsorship.id, sponsorshipId))
    .limit(1);
  if (!row) {
    throw new SponsorshipActionError(
      "notFound",
      `No sponsorship ${sponsorshipId}`
    );
  }
  return row;
}

function requireStatus(
  view: { id: string; status: SponsorshipStatus },
  allowed: readonly SponsorshipStatus[],
  action: string
): void {
  if (!allowed.includes(view.status)) {
    throw new SponsorshipActionError(
      "stale",
      `Cannot ${action} sponsorship ${view.id} in ${view.status}`
    );
  }
}

interface ActorInput {
  actorId: string;
  now: Date;
  sponsorshipId: string;
}

/**
 * Approve (A-05): only from `in_review` with the video set. It goes live
 * for 365 days from now, and `sponsorship_live` (with the stored dates,
 * bug 1) goes to the sponsor.
 */
export async function approveStatements(
  db: Db,
  input: ActorInput & { siteUrl: string }
): Promise<LifecyclePlan> {
  const { actorId, now, siteUrl, sponsorshipId } = input;
  const view = await readSponsorship(db, sponsorshipId);
  requireStatus(view, ["in_review"], "approve");
  if (!view.videoPlaybackId) {
    throw new SponsorshipActionError(
      "noVideo",
      `Sponsorship ${sponsorshipId} has no video yet`
    );
  }
  const startsAt = now;
  const endsAt = new Date(now.getTime() + DURATION_MS);
  return {
    after: [
      {
        email: {
          idempotencyKey: `sponsorship_live:${sponsorshipId}:${startsAt.getTime()}`,
          locale: view.sponsorLocale,
          props: {
            displayName: view.displayName,
            endsAt: endsAt.toISOString(),
            gestureName: view.gestureName,
            name: view.sponsorName,
            startsAt: startsAt.toISOString(),
            url: `${siteUrl}/gestures/${encodeURIComponent(view.gestureSlug)}`,
          },
          template: "transactional/sponsorship-live",
          to: view.sponsorEmail,
        },
        kind: "email",
      },
    ],
    statements: transitionStatements(db, {
      actorId,
      data: { endsAt: endsAt.toISOString(), startsAt: startsAt.toISOString() },
      event: "approved",
      from: "in_review",
      now,
      patch: { endsAt, startsAt },
      sponsorshipId,
    }),
  };
}

/** Reject (A-06): from `in_review` or `changes_requested`, with a reason. */
export async function rejectStatements(
  db: Db,
  input: ActorInput & { reason: string }
): Promise<LifecyclePlan> {
  const view = await readSponsorship(db, input.sponsorshipId);
  requireStatus(view, ["in_review", "changes_requested"], "reject");
  return {
    after: [],
    statements: transitionStatements(db, {
      actorId: input.actorId,
      data: { reason: input.reason },
      event: "rejected",
      from: view.status,
      now: input.now,
      sponsorshipId: input.sponsorshipId,
    }),
  };
}

export interface TokenPlan extends LifecyclePlan {
  /** Epoch ms. */
  expiresAt: number;
  /** The raw token, shown once (the admin copies the link). */
  token: string;
  url: string;
}

function linkUrl(
  siteUrl: string,
  purpose: SponsorshipTokenPurpose,
  token: string
): string {
  const path = purpose === "reedit" ? "/sponsor/edit" : "/sponsor/renew";
  return `${siteUrl}${path}?token=${encodeURIComponent(token)}`;
}

/**
 * Request changes (A-07): from `in_review` or `rejected`, issuing a 7 day
 * re-edit token that revokes the open ones. The sponsor gets no email
 * (parity): the admin copies the link.
 */
export async function requestChangesStatements(
  db: Db,
  input: ActorInput & { siteUrl: string }
): Promise<TokenPlan> {
  const { actorId, now, siteUrl, sponsorshipId } = input;
  const view = await readSponsorship(db, sponsorshipId);
  requireStatus(view, ["in_review", "rejected"], "request changes for");
  const issued = await issueTokenStatements(db, {
    actorId,
    expiresAt: new Date(now.getTime() + REEDIT_TOKEN_TTL_MS),
    now,
    purpose: "reedit",
    sponsorshipId,
  });
  return {
    after: [],
    expiresAt: issued.expiresAt.getTime(),
    statements: [
      ...transitionStatements(db, {
        actorId,
        data: {
          expiresAt: issued.expiresAt.toISOString(),
          tokenId: issued.tokenId,
        },
        event: "changes_requested",
        from: view.status,
        now,
        sponsorshipId,
      }),
      ...issued.statements,
    ],
    token: issued.token,
    url: linkUrl(siteUrl, "reedit", issued.token),
  };
}

/** The status a token of each purpose may be regenerated in. */
const REGENERATE_FROM = {
  reedit: "changes_requested",
  renewal: "expiring",
} as const satisfies Record<SponsorshipTokenPurpose, SponsorshipStatus>;

/**
 * A new link for a lost one (ruling 11): re-edit while
 * `changes_requested` (7 days), renewal while `expiring` (until
 * `ends_at`). The open tokens of that purpose are revoked in the batch.
 */
export async function regenerateTokenStatements(
  db: Db,
  input: ActorInput & { purpose: SponsorshipTokenPurpose; siteUrl: string }
): Promise<TokenPlan> {
  const { actorId, now, purpose, siteUrl, sponsorshipId } = input;
  const view = await readSponsorship(db, sponsorshipId);
  const from = REGENERATE_FROM[purpose];
  requireStatus(view, [from], `regenerate the ${purpose} link of`);
  const expiresAt =
    purpose === "renewal" && view.endsAt
      ? view.endsAt
      : new Date(now.getTime() + REEDIT_TOKEN_TTL_MS);
  const issued = await issueTokenStatements(db, {
    actorId,
    expiresAt,
    now,
    purpose,
    sponsorshipId,
  });
  return {
    after: [],
    expiresAt: expiresAt.getTime(),
    statements: [
      failWhen(
        db,
        STALE_GUARD,
        sql`NOT EXISTS (SELECT 1 FROM ${sponsorship} WHERE ${sponsorship.id} = ${sponsorshipId} AND ${sponsorship.status} = ${from})`
      ),
      ...issued.statements,
    ],
    token: issued.token,
    url: linkUrl(siteUrl, purpose, issued.token),
  };
}

interface PaymentView {
  amountCents: number;
  id: string;
  items: {
    endsAt: Date | null;
    sponsorshipId: string;
    status: SponsorshipStatus;
  }[];
  kind: PaymentKind;
  refundedCents: number;
  status: PaymentStatus;
}

async function readPayment(db: Db, paymentId: string): Promise<PaymentView> {
  const [row] = await db
    .select({
      amountCents: payment.amountCents,
      id: payment.id,
      kind: payment.kind,
      refundedCents: payment.refundedCents,
      status: payment.status,
    })
    .from(payment)
    .where(eq(payment.id, paymentId))
    .limit(1);
  if (!row) {
    throw new SponsorshipActionError("notFound", `No payment ${paymentId}`);
  }
  const items = await db
    .select({
      endsAt: sponsorship.endsAt,
      sponsorshipId: sponsorship.id,
      status: sponsorship.status,
    })
    .from(paymentItem)
    .innerJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
    .where(eq(paymentItem.paymentId, paymentId))
    .orderBy(asc(sponsorship.id));
  return { ...row, items };
}

function requireOpen(view: PaymentView, action: string): void {
  if (view.status !== "open") {
    throw new SponsorshipActionError(
      "stale",
      `Cannot ${action} payment ${view.id} in ${view.status}`
    );
  }
}

export interface PaymentPlan extends LifecyclePlan {
  /** Every sponsorship of the payment (one audit entry each). */
  sponsorshipIds: string[];
}

/**
 * Mark paid by hand (A-10, a bank transfer): the whole payment. The admin
 * re-fetched Mollie first (a payment Mollie reports paid is settled
 * instead) and cancelled it there when it could. The payment becomes
 * `paid`; an initial payment's items go to `rendering`
 * (`marked_paid_manually`), a renewal's sponsorship gets its year
 * (`renewed`, `manual`). `payment.settled` follows, so the same render path
 * makes the video (bug 32).
 */
export async function markPaidStatements(
  db: Db,
  input: { actorId: string; note?: string; now: Date; paymentId: string }
): Promise<PaymentPlan> {
  const { actorId, now, paymentId } = input;
  const view = await readPayment(db, paymentId);
  requireOpen(view, "mark paid");
  let changes: Statement[];
  if (view.kind === "renewal") {
    const [item] = view.items;
    if (!(item && isRenewable(item.status))) {
      throw new SponsorshipActionError(
        "notRenewable",
        `The sponsorship of renewal ${paymentId} cannot be renewed`
      );
    }
    changes = renewStatements(db, {
      actorId,
      item,
      manual: true,
      now,
      paymentId,
    });
  } else {
    changes = view.items
      .filter((item) => item.status === "awaiting_payment")
      .flatMap((item) =>
        transitionStatements(db, {
          actorId,
          data: {
            paymentId,
            ...(input.note?.trim() ? { note: input.note } : {}),
          },
          event: "marked_paid_manually",
          from: item.status,
          now,
          sponsorshipId: item.sponsorshipId,
        })
      );
  }
  return {
    after: [{ event: { paymentId, type: "payment.settled" }, kind: "event" }],
    sponsorshipIds: view.items.map((item) => item.sponsorshipId),
    statements: [
      paymentGuard(db, paymentId, ["open"]),
      ...changes,
      db
        .update(payment)
        .set({ paidAt: now, status: "paid", updatedAt: now })
        .where(eq(payment.id, paymentId)),
    ],
  };
}

/**
 * Cancel (A-11): only an `open` payment, the whole payment. The admin
 * re-fetched Mollie first (`paid` is refused there) and cancelled it at
 * Mollie when it could. An initial payment's items are `cancelled`
 * (`{ reason: "admin" }`); a renewal only marks the payment.
 */
export async function cancelPaymentStatements(
  db: Db,
  input: { actorId: string; now: Date; paymentId: string }
): Promise<PaymentPlan> {
  const { actorId, now, paymentId } = input;
  const view = await readPayment(db, paymentId);
  requireOpen(view, "cancel");
  return {
    after: [],
    sponsorshipIds: view.items.map((item) => item.sponsorshipId),
    statements: [
      paymentGuard(db, paymentId, ["open"]),
      db
        .update(payment)
        .set({ status: "canceled", updatedAt: now })
        .where(eq(payment.id, paymentId)),
      ...(view.kind === "initial"
        ? view.items
            .filter((item) => item.status === "awaiting_payment")
            .flatMap((item) =>
              transitionStatements(db, {
                actorId,
                data: { paymentId, reason: "admin" },
                event: "cancelled",
                from: item.status,
                now,
                sponsorshipId: item.sponsorshipId,
              })
            )
        : []),
    ],
  };
}

/**
 * Force expire (A-12): from `live` or `expiring`. `muxAssetId` is the
 * sponsored video's asset to delete after the batch (as the expiry sweep
 * does), or `null` when there is none or it is the gesture's own.
 */
export async function forceExpireStatements(
  db: Db,
  input: ActorInput
): Promise<LifecyclePlan & { muxAssetId: string | null }> {
  const view = await readSponsorship(db, input.sponsorshipId);
  requireStatus(view, ["live", "expiring"], "force expire");
  const own = view.videoAssetId === view.gestureMuxAssetId;
  return {
    after: [],
    muxAssetId: view.videoAssetId && !own ? view.videoAssetId : null,
    statements: transitionStatements(db, {
      actorId: input.actorId,
      data: {},
      event: "force_expired",
      from: view.status,
      now: input.now,
      sponsorshipId: input.sponsorshipId,
    }),
  };
}

/**
 * Record a refund made in the Mollie dashboard (ruling 4), from Mollie's
 * re-fetched payment: `refunded_cents` and the first `refunded_at`.
 * `notRefunded` when Mollie reports nothing refunded.
 */
export async function recordRefundStatements(
  db: Db,
  input: { now: Date; payment: MolliePayment; paymentId: string }
): Promise<LifecyclePlan & { amountCents: number; refundedCents: number }> {
  const view = await readPayment(db, input.paymentId);
  const refundedCents = input.payment.amountRefundedCents;
  if (refundedCents <= 0) {
    throw new SponsorshipActionError(
      "notRefunded",
      `Mollie reports no refund for payment ${input.paymentId}`
    );
  }
  return {
    after: [],
    amountCents: view.amountCents,
    refundedCents,
    statements: [
      refundStatement(db, {
        now: input.now,
        paymentId: input.paymentId,
        refundedCents,
      }),
    ],
  };
}
