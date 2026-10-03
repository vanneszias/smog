/**
 * What a Mollie payment's status means for ours (ruling 6). The webhook,
 * `sponsorships.paymentStatus`, the stale sweep and the admin's mark paid
 * all re-fetch the payment from Mollie (the webhook body is only a
 * pointer) and call `settlePayment`, which is idempotent by the stored
 * payment status: every write is guarded by the status it read
 * (`paymentGuard`), so a replayed, duplicated or out-of-order call leaves
 * exactly one state. The caller enqueues `events` (the `payment.settled`
 * fan-out) and `notify` (the admin emails) after it returns.
 */

import { SPONSORSHIP_DURATION_DAYS } from "@smog/config/constants";
import {
  BLOCKING_SPONSORSHIP_STATUSES,
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
import { emailAdmins } from "./recipients";
import {
  isGestureTaken,
  isStalePayment,
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
  now: Date;
  /** Mollie's payment, just re-fetched. */
  payment: MolliePayment;
}

interface PaymentRow {
  amountCents: number;
  id: string;
  kind: PaymentKind;
  mollieId: string | null;
  refundedCents: number;
  status: PaymentStatus;
}

interface ItemRow {
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

const PAYMENT_COLUMNS = {
  amountCents: payment.amountCents,
  id: payment.id,
  kind: payment.kind,
  mollieId: payment.mollieId,
  refundedCents: payment.refundedCents,
  status: payment.status,
};

/**
 * Our payment for Mollie's: by `payment.mollie_id`, else by the
 * `metadata.paymentId` we sent (a crash may have left `mollie_id` unset),
 * or `null` when it is not ours.
 */
async function findPayment(
  db: Db,
  mollie: MolliePayment
): Promise<PaymentRow | null> {
  const [byMollieId] = await db
    .select(PAYMENT_COLUMNS)
    .from(payment)
    .where(eq(payment.mollieId, mollie.id))
    .limit(1);
  if (byMollieId) {
    return byMollieId;
  }
  const paymentId = mollie.metadata?.paymentId;
  if (typeof paymentId !== "string") {
    return null;
  }
  const [byMetadata] = await db
    .select(PAYMENT_COLUMNS)
    .from(payment)
    .where(and(eq(payment.id, paymentId), isNull(payment.mollieId)))
    .limit(1);
  return byMetadata ?? null;
}

async function loadItems(db: Db, paymentId: string): Promise<ItemRow[]> {
  return await db
    .select({
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
 * end, the reminder reset, and the open renewal tokens used (bug 35).
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
      patch: { endsAt, reminderSentAt: null },
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
  /** `mollie_id` and the refunded amount, written with any batch. */
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

/**
 * The payment becomes `refund_needed` and every admin is emailed. `before`
 * are the item changes of the same batch (the released items of a
 * mismatch); every item not in `kept` gets a `refund_needed` event.
 */
async function flagRefund(
  db: Db,
  context: Context,
  options: {
    before?: Statement[];
    events?: EventMessage[];
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
  const notify = await emailAdmins(db, now, (admin) => ({
    idempotencyKey: `admin_refund_needed:${row.id}:${admin.id}`,
    locale: admin.locale,
    props: {
      amountCents: mollie.amountCents,
      paymentId: row.id,
      reason: options.reason,
      url:
        mollie.dashboardUrl ??
        `https://my.mollie.com/dashboard/payments/${mollie.id}`,
    },
    template: "transactional/admin-refund-needed",
    to: admin.email,
  }));
  return result(context, "refund_needed", {
    events: options.events ?? [],
    notify,
  });
}

/** Mollie says paid and the amount or currency differ from ours (bug 6). */
async function settleMismatch(db: Db, context: Context): Promise<SettleResult> {
  const { items, mollie, now, row } = context;
  console.error(
    `[sponsorships] Mollie's amount for payment ${row.id} (${mollie.id}) is ${mollie.amountCents} ${mollie.currency}, ours is ${row.amountCents} EUR; flagged refund_needed`
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
  const events = revived > 0 ? settled(row.id) : [];
  if (flagged.length > 0) {
    return await flagRefund(db, context, {
      before: pending,
      events,
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
  return result(context, "late_revived", { events });
}

async function settlePaid(db: Db, context: Context): Promise<SettleResult> {
  const { mollie, row } = context;
  if (row.status === "refund_needed") {
    return await noop(db, context);
  }
  if (row.status === "paid") {
    // Mollie's money arrived for a payment an admin already marked paid.
    return (await markedPaidByHand(db, row.id))
      ? await flagRefund(db, context, { flagged: [], reason: "double" })
      : await noop(db, context, "already");
  }
  if (mollie.amountCents !== row.amountCents || mollie.currency !== "EUR") {
    return await settleMismatch(db, context);
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
  { now, payment: mollie }: SettleInput
): Promise<SettleResult | null> {
  const row = await findPayment(db, mollie);
  if (!row) {
    return null;
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
  const context: Context = {
    extra,
    items: await loadItems(db, row.id),
    mollie,
    now,
    row,
  };
  const mapped = mapMollieStatus(mollie.status);
  if (mapped === "paid") {
    return await settlePaid(db, context);
  }
  if (mapped === "open") {
    return await noop(db, context);
  }
  return await settleEnded(db, context, mapped);
}

/**
 * Applies Mollie's view of a payment to ours (ruling 6); `null` when the
 * payment is not ours. Idempotent: a lost race (another settle moved the
 * payment or an item on) is read again once.
 */
export async function settlePayment(
  db: Db,
  input: SettleInput
): Promise<SettleResult | null> {
  try {
    return await settleOnce(db, input);
  } catch (error) {
    if (isStalePayment(error) || isStaleTransition(error)) {
      return await settleOnce(db, input);
    }
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
