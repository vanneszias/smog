/**
 * What a Mollie payment's status means for ours (ruling 6). The webhook,
 * `sponsorships.paymentStatus`, the stale sweep and the admin's mark paid
 * all re-fetch the payment from Mollie (the webhook body is only a
 * pointer) and call `settlePayment`, which is idempotent by the stored
 * payment status: every write is guarded by the status it read
 * (`paymentGuard`), so a replayed, duplicated or out-of-order call leaves
 * exactly one state. The caller enqueues `events` (the `payment.settled`
 * fan-out) and `notify` (the admin emails) after it returns, whatever the
 * outcome. A retry re-derives both from the stored state (fix round 1,
 * I-1), so a caller that failed after the commit loses nothing: the
 * idempotency keys make the resends safe.
 */

import { SPONSORSHIP_DURATION_DAYS } from "@smog/config/constants";
import {
  BLOCKING_SPONSORSHIP_STATUSES,
  failWhen,
  type PaymentKind,
  type PaymentStatus,
  payment,
  paymentItem,
  type SponsorshipStatus,
  type Statement,
  sponsorship,
  sponsorshipEvent,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import type { OutboxEmail } from "@smog/email";
import type { EventMessage } from "@smog/jobs";
import {
  getPayment,
  type MollieClient,
  type MolliePayment,
  mapMollieStatus,
} from "@smog/payments";
import { DAY_MS } from "@smog/utils";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { RefundReason } from "../schema/events";
import { insideEmailWindow } from "./email-window";
import { emailAdmins } from "./recipients";
import {
  isGestureTaken,
  isStalePayment,
  PAYMENT_STALE_GUARD,
  paymentGuard,
  refundStatement,
  revokeTokensStatement,
} from "./statements";
import {
  eventStatement,
  isStaleTransition,
  transitionStatements,
} from "./transition";

export type SettleOutcome =
  /** Our open payment is now paid. */
  | "paid"
  /** It was paid already: nothing written, the fan-out is enqueued again. */
  | "already"
  /** Paid after it was cancelled, failed or expired, and applied (D-LATEPAID). */
  | "late_revived"
  /** The money cannot be used: an admin refunds it by hand (ruling 4). */
  | "refund_needed"
  /** Mollie failed, cancelled or expired our open payment. */
  | "failed"
  /**
   * Another Mollie payment names ours in its metadata while ours points
   * at a different Mollie id: never applied; logged, and told when paid
   * (Phase 6 fix wave, payments M-6).
   */
  | "duplicate"
  /** Nothing to change (still open, or already final). */
  | "noop";

export interface SettleResult {
  /** For the caller to enqueue on `EVENTS_QUEUE`, after the batch. */
  events: EventMessage[];
  kind: PaymentKind;
  /** For the caller to enqueue on `EMAIL_QUEUE` (the admin emails). */
  notify: OutboxEmail[];
  outcome: SettleOutcome;
  /** Our payment id. */
  paymentId: string;
}

export interface SettleInput {
  /**
   * Statements the caller needs in the same batch as the settlement, such
   * as the admin's audit entries for a mark paid that found the payment
   * paid at Mollie. Every path writes them with its final batch: alone when
   * nothing else changes (`noop`, `already`). A lost race reuses them in
   * the retry.
   */
  extra?: Statement[];
  now: Date;
  /** Mollie's payment, just re-fetched. */
  payment: MolliePayment;
}

interface PaymentRow {
  amountCents: number;
  /** When the stored chargeback amount was last raised. */
  chargedBackAt: Date | null;
  chargedBackCents: number;
  id: string;
  kind: PaymentKind;
  mollieId: string | null;
  refundedCents: number;
  status: PaymentStatus;
}

interface ItemRow {
  /** This item's share of the payment (`payment_item.amount_cents`). */
  amountCents: number;
  endsAt: Date | null;
  sponsorshipId: string;
  status: SponsorshipStatus;
}

const DURATION_MS = SPONSORSHIP_DURATION_DAYS * DAY_MS;
const LATE_STATUSES: readonly PaymentStatus[] = [
  "canceled",
  "expired",
  "failed",
];
const RENEWABLE: readonly SponsorshipStatus[] = ["live", "expiring"];
const BLOCKING: readonly SponsorshipStatus[] = BLOCKING_SPONSORSHIP_STATUSES;
/** The statuses of an item whose payment counted: it needs the fan-out. */
const PAST_PAYMENT: readonly SponsorshipStatus[] = BLOCKING.filter(
  (status) => status !== "awaiting_payment"
);

const PAYMENT_COLUMNS = {
  amountCents: payment.amountCents,
  chargedBackAt: payment.chargedBackAt,
  chargedBackCents: payment.chargedBackCents,
  id: payment.id,
  kind: payment.kind,
  mollieId: payment.mollieId,
  refundedCents: payment.refundedCents,
  status: payment.status,
};

/**
 * Our payment for Mollie's: by `payment.mollie_id`, else by the
 * `metadata.paymentId` we sent (a crash may have left `mollie_id` unset),
 * or `null` when it is not ours. `duplicate` when the metadata names ours
 * but ours already points at another Mollie payment (M-6).
 */
async function findPayment(
  db: Db,
  mollie: MolliePayment
): Promise<{ duplicate: boolean; row: PaymentRow } | null> {
  const [byMollieId] = await db
    .select(PAYMENT_COLUMNS)
    .from(payment)
    .where(eq(payment.mollieId, mollie.id))
    .limit(1);
  if (byMollieId) {
    return { duplicate: false, row: byMollieId };
  }
  const paymentId = mollie.metadata?.paymentId;
  if (typeof paymentId !== "string") {
    return null;
  }
  const [byMetadata] = await db
    .select(PAYMENT_COLUMNS)
    .from(payment)
    .where(eq(payment.id, paymentId))
    .limit(1);
  if (!byMetadata) {
    return null;
  }
  return { duplicate: byMetadata.mollieId !== null, row: byMetadata };
}

async function loadItems(db: Db, paymentId: string): Promise<ItemRow[]> {
  return await db
    .select({
      amountCents: paymentItem.amountCents,
      endsAt: sponsorship.endsAt,
      sponsorshipId: sponsorship.id,
      status: sponsorship.status,
    })
    .from(paymentItem)
    .innerJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
    .where(eq(paymentItem.paymentId, paymentId))
    .orderBy(asc(sponsorship.id));
}

/** Whether an admin marked this payment paid by hand (ruling 14). */
async function markedPaidByHand(db: Db, paymentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sponsorshipEvent.id })
    .from(paymentItem)
    .innerJoin(
      sponsorshipEvent,
      eq(sponsorshipEvent.sponsorshipId, paymentItem.sponsorshipId)
    )
    .where(
      and(
        eq(paymentItem.paymentId, paymentId),
        sql`json_extract(${sponsorshipEvent.data}, '$.paymentId') = ${paymentId}`,
        or(
          eq(sponsorshipEvent.type, "marked_paid_manually"),
          and(
            eq(sponsorshipEvent.type, "renewed"),
            sql`json_extract(${sponsorshipEvent.data}, '$.manual') = 1`
          )
        )
      )
    )
    .limit(1);
  return row !== undefined;
}

function setPayment(
  db: Db,
  paymentId: string,
  values: { paidAt?: Date; status: PaymentStatus },
  now: Date
): Statement {
  return db
    .update(payment)
    .set({ ...values, updatedAt: now })
    .where(eq(payment.id, paymentId));
}

function settled(paymentId: string): EventMessage[] {
  return [{ paymentId, type: "payment.settled" }];
}

/**
 * The renewal of `item` by `paymentId`: one more year from its current
 * end, the reminder reset, and the open renewal tokens used (bug 35). The
 * year is added in SQL (`ends_at + 365 d`), so two renewals settling at
 * once add two years (fix round 1, Minor 1); the event's `endsAt` is the
 * end as read plus one year.
 */
export function renewStatements(
  db: Db,
  input: {
    actorId?: string | null;
    item: {
      endsAt: Date | null;
      sponsorshipId: string;
      status: SponsorshipStatus;
    };
    manual?: boolean;
    now: Date;
    paymentId: string;
  }
): Statement[] {
  const { item, now, paymentId } = input;
  const base = item.endsAt?.getTime() ?? now.getTime();
  const endsAt = new Date(base + DURATION_MS);
  return [
    ...transitionStatements(db, {
      actorId: input.actorId ?? null,
      data: {
        endsAt: endsAt.toISOString(),
        paymentId,
        ...(input.manual ? { manual: true } : {}),
      },
      event: "renewed",
      from: item.status,
      now,
      patch: {
        endsAt: sql`coalesce(${sponsorship.endsAt}, ${now.getTime()}) + ${DURATION_MS}`,
        reminderSentAt: null,
      },
      sponsorshipId: item.sponsorshipId,
    }),
    revokeTokensStatement(db, {
      now,
      purpose: "renewal",
      sponsorshipId: item.sponsorshipId,
    }),
  ];
}

/** Whether a renewal's sponsorship can still take the extra year. */
export function isRenewable(status: SponsorshipStatus): boolean {
  return RENEWABLE.includes(status);
}

interface Context {
  /**
   * `mollie_id`, the refunded amount, a new chargeback and the caller's
   * `extra`: written with the final batch of every path.
   */
  extra: Statement[];
  items: ItemRow[];
  mollie: MolliePayment;
  now: Date;
  row: PaymentRow;
}

function result(
  context: Context,
  outcome: SettleOutcome,
  options: { events?: EventMessage[]; notify?: OutboxEmail[] } = {}
): SettleResult {
  return {
    events: options.events ?? [],
    kind: context.row.kind,
    notify: options.notify ?? [],
    outcome,
    paymentId: context.row.id,
  };
}

async function run(db: Db, statements: Statement[]): Promise<void> {
  const [first, ...rest] = statements;
  if (first) {
    await db.batch([first, ...rest]);
  }
}

/** Nothing changes but `mollie_id` and the refunded amount, if they did. */
async function noop(
  db: Db,
  context: Context,
  outcome: "noop" | "already" = "noop"
): Promise<SettleResult> {
  await run(db, context.extra);
  return result(context, outcome, {
    events: outcome === "already" ? settled(context.row.id) : [],
  });
}

/** The Mollie dashboard page of a payment, for the admin emails. */
function dashboardUrl(mollie: MolliePayment): string {
  return (
    mollie.dashboardUrl ??
    `https://my.mollie.com/dashboard/payments/${mollie.id}`
  );
}

/**
 * The outputs of a `refund_needed` payment, derived from what is stored
 * (fix round 1, I-1), on the first run and on every retry alike:
 * - `events`: `payment.settled` while any item went past payment (a late
 *   revival, or the sponsorship of a payment paid twice);
 * - `notify`: the `admin_refund_needed` email per admin (keyed, so a
 *   resend is skipped), with the reason of the payment's `refund_needed`
 *   events and the amount to refund: the flagged items' share for `late`
 *   (Minor 4), what Mollie received otherwise.
 */
async function refundOutcome(db: Db, context: Context): Promise<SettleResult> {
  const { mollie, now, row } = context;
  const items = await loadItems(db, row.id);
  const flags = await db
    .select({
      createdAt: sponsorshipEvent.createdAt,
      reason: sql<string>`json_extract(${sponsorshipEvent.data}, '$.reason')`,
      sponsorshipId: sponsorshipEvent.sponsorshipId,
    })
    .from(paymentItem)
    .innerJoin(
      sponsorshipEvent,
      eq(sponsorshipEvent.sponsorshipId, paymentItem.sponsorshipId)
    )
    .where(
      and(
        eq(paymentItem.paymentId, row.id),
        eq(sponsorshipEvent.type, "refund_needed"),
        sql`json_extract(${sponsorshipEvent.data}, '$.paymentId') = ${row.id}`,
        sql`json_extract(${sponsorshipEvent.data}, '$.reason') <> 'chargeback'`
      )
    )
    .orderBy(
      asc(sponsorshipEvent.createdAt),
      asc(sql`${sponsorshipEvent}.rowid`)
    );
  const reason = (flags.at(-1)?.reason ?? "late") as RefundReason;
  const flagged = new Set(
    flags.filter((flag) => flag.reason === reason).map((f) => f.sponsorshipId)
  );
  const share = items
    .filter((item) => flagged.has(item.sponsorshipId))
    .reduce((total, item) => total + item.amountCents, 0);
  const amountCents =
    reason === "late" && share > 0 ? share : mollie.amountCents;
  // Told only while it is actionable and the KV marker of the first email
  // still dedupes a resend: not once Mollie's refund covers it, and only
  // within 6 days of the first flag (Phase 6 fix wave, payments I-1).
  const flaggedAt = flags[0]?.createdAt ?? now;
  const actionable =
    mollie.amountRefundedCents < amountCents &&
    insideEmailWindow(flaggedAt, now);
  const notify = actionable
    ? await refundEmails(db, now, { amountCents, mollie, reason, row })
    : [];
  return result(context, "refund_needed", {
    events: items.some((item) => PAST_PAYMENT.includes(item.status))
      ? settled(row.id)
      : [],
    notify,
  });
}

/** The `admin_refund_needed` email per admin (keyed per payment and admin). */
async function refundEmails(
  db: Db,
  now: Date,
  {
    amountCents,
    key,
    mollie,
    reason,
    row,
  }: {
    amountCents: number;
    /** Distinguishes another Mollie payment of ours (M-6). */
    key?: string;
    mollie: MolliePayment;
    reason: RefundReason;
    row: PaymentRow;
  }
): Promise<OutboxEmail[]> {
  return await emailAdmins(db, now, (admin) => ({
    idempotencyKey: `admin_refund_needed:${row.id}:${key ? `${key}:` : ""}${admin.id}`,
    locale: admin.locale,
    props: {
      amountCents,
      paymentId: row.id,
      reason,
      url: dashboardUrl(mollie),
    },
    template: "transactional/admin-refund-needed",
    to: admin.email,
  }));
}

/**
 * The payment becomes `refund_needed`: `before` are the item changes of
 * the same batch (the released items of a mismatch, the paid items of a
 * late payment), and every `flagged` item gets a `refund_needed` event
 * with the reason. The outputs are then derived (`refundOutcome`).
 */
async function flagRefund(
  db: Db,
  context: Context,
  options: {
    before?: Statement[];
    flagged: readonly string[];
    reason: RefundReason;
  }
): Promise<SettleResult> {
  const { mollie, now, row } = context;
  await run(db, [
    paymentGuard(db, row.id, [row.status]),
    ...(options.before ?? []),
    setPayment(
      db,
      row.id,
      // A payment marked paid by hand keeps its own `paid_at`.
      row.status === "paid"
        ? { status: "refund_needed" }
        : { paidAt: mollie.paidAt ?? now, status: "refund_needed" },
      now
    ),
    ...options.flagged.map((sponsorshipId) =>
      eventStatement(db, {
        actorId: null,
        data: { paymentId: row.id, reason: options.reason },
        now,
        sponsorshipId,
        type: "refund_needed",
      })
    ),
    ...context.extra,
  ]);
  return await refundOutcome(db, context);
}

/**
 * Mollie says paid and the amount or currency differ from ours (bug 6),
 * or the money went back already (`returned`: refunded or charged back
 * before we applied it, fix wave M-5). Either way nothing is activated.
 */
async function settleMismatch(
  db: Db,
  context: Context,
  cause: "amount" | "returned" = "amount"
): Promise<SettleResult> {
  const { items, mollie, now, row } = context;
  console.error(
    cause === "amount"
      ? `[sponsorships] Mollie's amount for payment ${row.id} (${mollie.id}) is ${mollie.amountCents} ${mollie.currency}, ours is ${row.amountCents} EUR; flagged refund_needed`
      : `[sponsorships] Mollie's ${mollie.id} for payment ${row.id} is paid but ${mollie.amountRefundedCents} cents were refunded and ${mollie.amountChargedBackCents} charged back already; not applied, flagged refund_needed`
  );
  // The items of an open payment are released, so the gestures are free.
  const before =
    row.status === "open"
      ? items
          .filter((item) => item.status === "awaiting_payment")
          .flatMap((item) =>
            transitionStatements(db, {
              actorId: null,
              data: { paymentId: row.id, reason: "mismatch" },
              event: "cancelled",
              from: item.status,
              now,
              sponsorshipId: item.sponsorshipId,
            })
          )
      : [];
  return await flagRefund(db, context, {
    before,
    flagged: items.map((item) => item.sponsorshipId),
    reason: "mismatch",
  });
}

/** A renewal paid (on time or late): one more year, or a refund. */
async function settleRenewal(
  db: Db,
  context: Context,
  outcome: "paid" | "late_revived"
): Promise<SettleResult> {
  const { items, mollie, now, row } = context;
  const [item] = items;
  if (!(item && isRenewable(item.status))) {
    // An expired (or ended) sponsorship is not revived by a renewal.
    return await flagRefund(db, context, {
      flagged: items.map((i) => i.sponsorshipId),
      reason: "late",
    });
  }
  await run(db, [
    paymentGuard(db, row.id, [row.status]),
    ...renewStatements(db, { item, now, paymentId: row.id }),
    setPayment(
      db,
      row.id,
      { paidAt: mollie.paidAt ?? now, status: "paid" },
      now
    ),
    ...context.extra,
  ]);
  return result(context, outcome, { events: settled(row.id) });
}

/** Our open initial payment is paid: every item goes to rendering. */
async function settleInitialPaid(
  db: Db,
  context: Context
): Promise<SettleResult> {
  const { items, mollie, now, row } = context;
  await run(db, [
    paymentGuard(db, row.id, ["open"]),
    ...items
      .filter((item) => item.status === "awaiting_payment")
      .flatMap((item) =>
        transitionStatements(db, {
          actorId: null,
          data: { paymentId: row.id },
          event: "payment_paid",
          from: item.status,
          now,
          sponsorshipId: item.sponsorshipId,
        })
      ),
    setPayment(
      db,
      row.id,
      { paidAt: mollie.paidAt ?? now, status: "paid" },
      now
    ),
    ...context.extra,
  ]);
  return result(context, "paid", { events: settled(row.id) });
}

/**
 * Paid after our payment was cancelled, failed or expired (spec §5.5,
 * D-LATEPAID): each cancelled item is revived in its own guarded batch,
 * and the partial unique index decides whether its gesture is still free.
 * Any item that cannot be revived makes the payment `refund_needed`.
 */
async function settleLateInitial(
  db: Db,
  context: Context
): Promise<SettleResult> {
  const { items, now, row } = context;
  let revived = 0;
  const flagged: string[] = [];
  const pending: Statement[] = [];
  for (const item of items) {
    if (item.status === "cancelled") {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each revival is its own batch, so a taken gesture fails only its own item.
        await db.batch(
          transitionStatements(db, {
            actorId: null,
            data: { paymentId: row.id },
            event: "revived",
            from: "cancelled",
            now,
            sponsorshipId: item.sponsorshipId,
          })
        );
        revived += 1;
      } catch (error) {
        if (!isGestureTaken(error)) {
          throw error;
        }
        flagged.push(item.sponsorshipId);
      }
    } else if (item.status === "awaiting_payment") {
      pending.push(
        ...transitionStatements(db, {
          actorId: null,
          data: { paymentId: row.id },
          event: "payment_paid",
          from: item.status,
          now,
          sponsorshipId: item.sponsorshipId,
        })
      );
      revived += 1;
    } else if (BLOCKING.includes(item.status)) {
      // Revived by an earlier run that stopped before the payment changed.
      revived += 1;
    } else {
      flagged.push(item.sponsorshipId);
    }
  }
  if (flagged.length > 0) {
    return await flagRefund(db, context, {
      before: pending,
      flagged,
      reason: "late",
    });
  }
  await run(db, [
    paymentGuard(db, row.id, [row.status]),
    ...pending,
    setPayment(
      db,
      row.id,
      { paidAt: context.mollie.paidAt ?? now, status: "paid" },
      now
    ),
    ...context.extra,
  ]);
  return result(context, "late_revived", {
    events: revived > 0 ? settled(row.id) : [],
  });
}

async function settlePaid(db: Db, context: Context): Promise<SettleResult> {
  const { mollie, row } = context;
  if (row.status === "refund_needed") {
    // Already flagged: re-derive the outputs, so a retry resends them.
    await run(db, context.extra);
    return await refundOutcome(db, context);
  }
  if (row.status === "paid") {
    // Mollie's money arrived for a payment an admin already marked paid.
    return (await markedPaidByHand(db, row.id))
      ? await flagRefund(db, context, {
          flagged: context.items.map((item) => item.sponsorshipId),
          reason: "double",
        })
      : await noop(db, context, "already");
  }
  if (mollie.amountCents !== row.amountCents || mollie.currency !== "EUR") {
    return await settleMismatch(db, context);
  }
  if (
    mollie.amountRefundedCents + mollie.amountChargedBackCents >=
    row.amountCents
  ) {
    return await settleMismatch(db, context, "returned");
  }
  const late = LATE_STATUSES.includes(row.status);
  if (row.kind === "renewal") {
    return await settleRenewal(db, context, late ? "late_revived" : "paid");
  }
  return late
    ? await settleLateInitial(db, context)
    : await settleInitialPaid(db, context);
}

/** Mollie failed, cancelled or expired our open payment. */
async function settleEnded(
  db: Db,
  context: Context,
  status: "failed" | "canceled" | "expired"
): Promise<SettleResult> {
  const { items, now, row } = context;
  if (row.status !== "open") {
    return await noop(db, context);
  }
  await run(db, [
    paymentGuard(db, row.id, ["open"]),
    setPayment(db, row.id, { status }, now),
    // A renewal only marks the payment: the sponsorship runs to its end.
    ...(row.kind === "initial"
      ? items
          .filter((item) => item.status === "awaiting_payment")
          .flatMap((item) =>
            transitionStatements(db, {
              actorId: null,
              data: { paymentId: row.id, status },
              event: "payment_failed",
              from: item.status,
              now,
              sponsorshipId: item.sponsorshipId,
            })
          )
      : []),
    ...context.extra,
  ]);
  return result(context, "failed");
}

async function settleOnce(
  db: Db,
  { extra: callerExtra = [], now, payment: mollie }: SettleInput
): Promise<SettleResult | null> {
  const found = await findPayment(db, mollie);
  if (!found) {
    return null;
  }
  const { row } = found;
  if (found.duplicate) {
    return await duplicateOutcome(db, { mollie, now, row });
  }
  const extra: Statement[] = [];
  if (row.mollieId === null) {
    extra.push(
      db
        .update(payment)
        .set({ mollieId: mollie.id })
        .where(and(eq(payment.id, row.id), isNull(payment.mollieId)))
    );
  }
  if (mollie.amountRefundedCents !== row.refundedCents) {
    extra.push(
      refundStatement(db, {
        now,
        paymentId: row.id,
        refundedCents: mollie.amountRefundedCents,
      })
    );
  }
  const items = await loadItems(db, row.id);
  extra.push(...chargebackStatements(db, { items, mollie, now, row }));
  extra.push(...callerExtra);
  const context: Context = { extra, items, mollie, now, row };
  const outcome = await settleStatus(db, context);
  outcome.notify.push(...(await chargebackNotify(db, context)));
  return outcome;
}

/**
 * Another Mollie payment names ours (M-6): a create whose `mollie_id`
 * update failed, then a retry past Mollie's idempotency window. It is never
 * applied. When it is paid the money arrived and nothing records it, so it
 * is logged as an error and the admins are told to refund it by hand
 * (reason `double`, keyed by that Mollie id), within 6 days of Mollie's
 * `paidAt` and until Mollie's refund covers it.
 */
async function duplicateOutcome(
  db: Db,
  { mollie, now, row }: { mollie: MolliePayment; now: Date; row: PaymentRow }
): Promise<SettleResult> {
  const base: SettleResult = {
    events: [],
    kind: row.kind,
    notify: [],
    outcome: "duplicate",
    paymentId: row.id,
  };
  if (mapMollieStatus(mollie.status) !== "paid") {
    console.warn(
      `[sponsorships] Mollie's ${mollie.id} (${mollie.status}) names payment ${row.id}, which is Mollie's ${row.mollieId}; ignored`
    );
    return base;
  }
  console.error(
    `[sponsorships] Mollie's ${mollie.id} names payment ${row.id}, which is Mollie's ${row.mollieId}, and it is paid: not applied, refund it by hand`
  );
  const told =
    mollie.amountRefundedCents < mollie.amountCents &&
    insideEmailWindow(mollie.paidAt ?? now, now);
  return told
    ? {
        ...base,
        notify: await refundEmails(db, now, {
          amountCents: mollie.amountCents,
          key: mollie.id,
          mollie,
          reason: "double",
          row,
        }),
      }
    : base;
}

async function settleStatus(db: Db, context: Context): Promise<SettleResult> {
  const mapped = mapMollieStatus(context.mollie.status);
  if (mapped === "paid") {
    return await settlePaid(db, context);
  }
  if (mapped === "open") {
    return await noop(db, context);
  }
  return await settleEnded(db, context, mapped);
}

/**
 * A new chargeback (Mollie's `amountChargedBack` above what is stored,
 * fix round 1, I-3): store it, and note it in each item's trail
 * (`refund_needed`, `chargeback`). The guard makes two concurrent settles
 * record it once (the loser reads again). The status stays `paid` and the
 * sponsorship is not touched: an admin decides (the cancel path).
 */
function chargebackStatements(
  db: Db,
  { items, mollie, now, row }: Omit<Context, "extra">
): Statement[] {
  const cents = mollie.amountChargedBackCents;
  if (cents < row.chargedBackCents) {
    return chargebackReversal(db, { cents, mollie, now, row });
  }
  if (cents === row.chargedBackCents) {
    return [];
  }
  console.warn(
    `[sponsorships] Chargeback of ${cents} cents on payment ${row.id} (${mollie.id})`
  );
  return [
    failWhen(
      db,
      PAYMENT_STALE_GUARD,
      sql`EXISTS (SELECT 1 FROM ${payment} WHERE ${payment.id} = ${row.id} AND ${payment.chargedBackCents} >= ${cents})`
    ),
    db
      .update(payment)
      .set({
        // When the amount last rose: the chargeback email's window (I-1).
        chargedBackAt: now,
        chargedBackCents: cents,
        updatedAt: now,
      })
      .where(eq(payment.id, row.id)),
    ...items.map((item) =>
      eventStatement(db, {
        actorId: null,
        data: { paymentId: row.id, reason: "chargeback" },
        now,
        sponsorshipId: item.sponsorshipId,
        type: "refund_needed",
      })
    ),
  ];
}

/**
 * Mollie lowered the chargeback (reversed, fully or in part; M-7): the
 * stored amount follows Mollie's, logged. `charged_back_at` keeps when it
 * last rose, and no trail entry is written (`refund_needed` means money to
 * return, and the event types are CHECKed); the log line is the record.
 */
function chargebackReversal(
  db: Db,
  {
    cents,
    mollie,
    now,
    row,
  }: { cents: number; mollie: MolliePayment; now: Date; row: PaymentRow }
): Statement[] {
  console.warn(
    `[sponsorships] Chargeback on payment ${row.id} (${mollie.id}) reversed: ${row.chargedBackCents} -> ${cents} cents`
  );
  return [
    failWhen(
      db,
      PAYMENT_STALE_GUARD,
      sql`EXISTS (SELECT 1 FROM ${payment} WHERE ${payment.id} = ${row.id} AND ${payment.chargedBackCents} <= ${cents})`
    ),
    db
      .update(payment)
      .set({ chargedBackCents: cents, updatedAt: now })
      .where(eq(payment.id, row.id)),
  ];
}

/**
 * The chargeback email per admin, keyed by the amount, so each new
 * chargeback is told once: while Mollie reports one that is not a
 * reversal, and within 6 days of when that amount was recorded (the KV
 * marker's window, Phase 6 fix wave I-1).
 */
async function chargebackNotify(
  db: Db,
  { mollie, now, row }: Context
): Promise<OutboxEmail[]> {
  const cents = mollie.amountChargedBackCents;
  if (cents <= 0 || cents < row.chargedBackCents) {
    return [];
  }
  const recordedAt =
    cents > row.chargedBackCents ? now : (row.chargedBackAt ?? now);
  if (!insideEmailWindow(recordedAt, now)) {
    return [];
  }
  return await emailAdmins(db, now, (admin) => ({
    idempotencyKey: `admin_chargeback:${row.id}:${cents}:${admin.id}`,
    locale: admin.locale,
    props: {
      amountCents: cents,
      paymentId: row.id,
      reason: "chargeback",
      url: dashboardUrl(mollie),
    },
    template: "transactional/admin-refund-needed",
    to: admin.email,
  }));
}

/**
 * A settle that lost a race reads again; a late payment's revivals and its
 * final batch can each lose once to a concurrent settle, so three attempts
 * always end on the winner's stored state.
 */
const SETTLE_ATTEMPTS = 3;

/**
 * Applies Mollie's view of a payment to ours (ruling 6); `null` when the
 * payment is not ours. Idempotent: a lost race (another settle moved the
 * payment or an item on) is read again, up to `SETTLE_ATTEMPTS` in all,
 * and the last error is logged.
 */
export async function settlePayment(
  db: Db,
  input: SettleInput
): Promise<SettleResult | null> {
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each attempt reads the state the last one lost to.
        return await settleOnce(db, input);
      } catch (error) {
        const lostRace = isStalePayment(error) || isStaleTransition(error);
        if (!lostRace || attempt >= SETTLE_ATTEMPTS) {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error(
      `[sponsorships] Failed to settle the Mollie payment ${input.payment.id}:`,
      error
    );
    throw error;
  }
}

/**
 * Re-fetches `mollieId` from Mollie and settles it: the webhook's and the
 * payment status poll's path. `null` when Mollie does not know the id
 * (404) or the payment is not ours. A Mollie failure throws
 * `MollieApiError` (`retryable` for a 5xx, 429 or network error).
 */
export async function settleFromMollie(
  db: Db,
  mollie: MollieClient,
  input: { mollieId: string; now: Date }
): Promise<SettleResult | null> {
  const fetched = await getPayment(mollie, input.mollieId);
  return fetched
    ? await settlePayment(db, { now: input.now, payment: fetched })
    : null;
}
