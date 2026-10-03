/**
 * When we first applied a payment, and the 6-day email window measured
 * from it (Phase 6 fix wave, jobs I-1). Mollie's `paidAt` is when the
 * money arrived at Mollie, which can be days before we learn of it (a
 * webhook outage, a key restored, a bank transfer settled by the stale
 * sweep). The windows of the `payment.settled` emails and of the
 * reconciliation therefore start at the payment's first settling
 * `sponsorship_event` (`payment_paid`, `revived`, `renewed`,
 * `marked_paid_manually` with `data.paymentId`), and only fall back to
 * `paid_at` for a payment without one (migrated rows, fixtures).
 */
import { payment, paymentItem, ref, sponsorshipEvent } from "@smog/db";
import type { Db } from "@smog/db/client";
import type { SponsorshipEventType } from "@smog/db/enums";
import { EMAIL_SENT_TTL_SECONDS } from "@smog/jobs";
import { DAY_MS } from "@smog/utils";
import { eq, type SQL, sql } from "drizzle-orm";

/**
 * The emails of an event go out only while it is under 6 days old: inside
 * the email consumer's 7-day `email:sent:<key>` marker, with a day to
 * spare. Every real retry (the events DLQ after about 4 h, Mollie's
 * retries for about a day) falls well inside it (fix round 1, I-1).
 */
export const EMAIL_WINDOW_MS = EMAIL_SENT_TTL_SECONDS * 1000 - DAY_MS;

/** The events that mean a payment's money was applied. */
export const SETTLING_EVENTS = [
  "payment_paid",
  "revived",
  "renewed",
  "marked_paid_manually",
] as const satisfies readonly SponsorshipEventType[];

const SETTLING_LIST = sql.raw(
  SETTLING_EVENTS.map((type) => `'${type}'`).join(", ")
);

/**
 * The `created_at` (ms) of the first settling event of the payment whose
 * id is `paymentId` (a value, or a column of the outer query), or NULL.
 */
export function firstSettledAtSql(paymentId: SQL | string): SQL<number | null> {
  return sql<
    number | null
  >`(SELECT min(${ref("se", sponsorshipEvent.createdAt)}) FROM ${paymentItem} AS ${sql.raw("pi")} INNER JOIN ${sponsorshipEvent} AS ${sql.raw("se")} ON ${ref("se", sponsorshipEvent.sponsorshipId)} = ${ref("pi", paymentItem.sponsorshipId)} WHERE ${ref("pi", paymentItem.paymentId)} = ${paymentId} AND ${ref("se", sponsorshipEvent.type)} IN (${SETTLING_LIST}) AND json_extract(${ref("se", sponsorshipEvent.data)}, '$.paymentId') = ${paymentId})`;
}

/**
 * When the payment's window starts (ms): its first settling event, else
 * `paid_at`, else `updated_at`, for the outer query's `payment` row.
 */
export const SETTLED_AT_SQL = sql<number>`coalesce(${firstSettledAtSql(ref("payment", payment.id))}, ${payment.paidAt}, ${payment.updatedAt})`;

/** When we first applied `paymentId` (see the module comment), or `null`. */
export async function firstSettledAt(
  db: Db,
  paymentId: string
): Promise<Date | null> {
  const [row] = await db
    .select({ at: firstSettledAtSql(paymentId) })
    .from(payment)
    .where(eq(payment.id, paymentId))
    .limit(1);
  const at = row?.at;
  return typeof at === "number" ? new Date(at) : null;
}

/** Whether something that happened at `since` may still be emailed at `now`. */
export function insideEmailWindow(since: Date, now: Date): boolean {
  return now.getTime() - since.getTime() < EMAIL_WINDOW_MS;
}
