/**
 * The `payment.settled` fan-out (rulings 7 and 8), which the site's
 * `EVENTS_QUEUE` consumer runs. Everything is derived from D1 on every
 * run, so a duplicate or retried message is safe:
 * - an initial payment: `sponsorship_received` and `payment_confirmed` per
 *   sponsorship, and `admin_new_sponsorship` per admin;
 * - a renewal: `payment_confirmed` with the new end.
 * Every email has its idempotency key (ruling 8) and goes out only within
 * 6 days of when we first applied the payment (`EMAIL_WINDOW_MS` from its
 * first settling event, else `paid_at`; fix wave, jobs I-1: Mollie's
 * `paidAt` may be days older). Only items past payment
 * count (`rendering` … `expiring`): a cancelled item, or one flagged
 * `refund_needed` (`late`/`mismatch`) for this payment, gets nothing
 * (task 3 fix round 1, I-1).
 */
import {
  BLOCKING_SPONSORSHIP_STATUSES,
  gesture,
  invoiceRequest,
  payment,
  paymentItem,
  type SponsorshipStatus,
  sponsor,
  sponsorship,
  sponsorshipEvent,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import type { OutboxEmail } from "@smog/email";
import type { Outputs } from "@smog/jobs";
import { and, asc, eq, sql } from "drizzle-orm";
import { firstSettledAt, insideEmailWindow } from "./email-window";
import { emailAdmins } from "./recipients";

const PAST_PAYMENT: readonly SponsorshipStatus[] =
  BLOCKING_SPONSORSHIP_STATUSES.filter(
    (status) => status !== "awaiting_payment"
  );
const TRAILING_SLASHES = /\/+$/;

interface ItemRow {
  amountCents: number;
  displayName: string;
  endsAt: Date | null;
  gestureName: string;
  sponsorshipId: string;
  status: SponsorshipStatus;
}

async function loadItems(db: Db, paymentId: string): Promise<ItemRow[]> {
  return await db
    .select({
      amountCents: paymentItem.amountCents,
      displayName: sponsorship.displayName,
      endsAt: sponsorship.endsAt,
      gestureName: gesture.name,
      sponsorshipId: sponsorship.id,
      status: sponsorship.status,
    })
    .from(paymentItem)
    .innerJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .where(eq(paymentItem.paymentId, paymentId))
    .orderBy(asc(gesture.name), asc(sponsorship.id));
}

/** The items this payment's money cannot apply to (`late`, `mismatch`). */
async function flaggedItems(db: Db, paymentId: string): Promise<Set<string>> {
  const rows = await db
    .select({ sponsorshipId: sponsorshipEvent.sponsorshipId })
    .from(paymentItem)
    .innerJoin(
      sponsorshipEvent,
      eq(sponsorshipEvent.sponsorshipId, paymentItem.sponsorshipId)
    )
    .where(
      and(
        eq(paymentItem.paymentId, paymentId),
        eq(sponsorshipEvent.type, "refund_needed"),
        sql`json_extract(${sponsorshipEvent.data}, '$.paymentId') = ${paymentId}`,
        sql`json_extract(${sponsorshipEvent.data}, '$.reason') IN ('late', 'mismatch')`
      )
    );
  return new Set(rows.map((row) => row.sponsorshipId));
}

/** The sponsor of a payment (every item has the same one). */
async function sponsorOf(db: Db, sponsorshipId: string) {
  const [row] = await db
    .select({
      company: sponsor.company,
      email: sponsor.email,
      invoiceEmail: invoiceRequest.email,
      invoiceName: invoiceRequest.name,
      locale: sponsor.locale,
      name: sponsor.name,
      vatNumber: invoiceRequest.vatNumber,
    })
    .from(sponsorship)
    .innerJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
    .leftJoin(invoiceRequest, eq(invoiceRequest.sponsorId, sponsor.id))
    .where(eq(sponsorship.id, sponsorshipId))
    .limit(1);
  return row ?? null;
}

/**
 * The fan-out of one settled payment (see the module comment): the emails
 * are for the caller to enqueue (nothing is rendered any more, phase 10b
 * task 9, so `events` is always empty).
 */
export async function handlePaymentSettled(
  db: Db,
  input: { now: Date; paymentId: string; siteUrl: string }
): Promise<Outputs> {
  const { now, paymentId } = input;
  const siteUrl = input.siteUrl.replace(TRAILING_SLASHES, "");
  const [row] = await db
    .select({
      amountCents: payment.amountCents,
      kind: payment.kind,
      paidAt: payment.paidAt,
      status: payment.status,
    })
    .from(payment)
    .where(eq(payment.id, paymentId))
    .limit(1);
  if (!row || (row.status !== "paid" && row.status !== "refund_needed")) {
    console.warn(
      `[sponsorships] payment.settled for ${paymentId}, which is ${row?.status ?? "unknown"}: nothing to do`
    );
    return { events: [], notify: [] };
  }
  const flagged = await flaggedItems(db, paymentId);
  const items = (await loadItems(db, paymentId)).filter(
    (item) =>
      PAST_PAYMENT.includes(item.status) && !flagged.has(item.sponsorshipId)
  );
  const [first] = items;
  if (!first) {
    return { events: [], notify: [] };
  }
  const since = (await firstSettledAt(db, paymentId)) ?? row.paidAt;
  if (since && !insideEmailWindow(since, now)) {
    // A refund or chargeback weeks later settles `already` and fans out
    // again: the jobs are re-checked, but the emails were sent long ago,
    // and their KV markers are gone.
    return { events: [], notify: [] };
  }
  const contact = await sponsorOf(db, first.sponsorshipId);
  if (!contact) {
    return { events: [], notify: [] };
  }
  const notify: OutboxEmail[] = [];
  for (const item of items) {
    if (row.kind === "initial") {
      notify.push({
        idempotencyKey: `sponsorship_received:${item.sponsorshipId}`,
        locale: contact.locale,
        props: {
          displayName: item.displayName,
          gestureName: item.gestureName,
          name: contact.name,
        },
        template: "transactional/sponsorship-received",
        to: contact.email,
      });
    }
    notify.push({
      idempotencyKey: `payment_confirmed:${paymentId}:${item.sponsorshipId}`,
      locale: contact.locale,
      props: {
        amountCents: item.amountCents,
        endsAt:
          row.kind === "renewal" ? (item.endsAt?.toISOString() ?? null) : null,
        gestureName: item.gestureName,
        kind: row.kind,
        name: contact.name,
      },
      template: "transactional/payment-confirmed",
      to: contact.email,
    });
  }
  if (row.kind === "initial") {
    const url =
      items.length === 1
        ? `${siteUrl}/admin/sponsorships/${first.sponsorshipId}`
        : `${siteUrl}/admin/sponsorships?payment=${paymentId}`;
    notify.push(
      ...(await emailAdmins(db, now, (admin) => ({
        idempotencyKey: `admin_new_sponsorship:${paymentId}:${admin.id}`,
        locale: admin.locale,
        props: {
          contact: {
            company: contact.company,
            email: contact.email,
            name: contact.name,
          },
          displayName: first.displayName,
          gestures: items.map((item) => ({
            amountCents: item.amountCents,
            name: item.gestureName,
          })),
          invoice:
            contact.invoiceName && contact.invoiceEmail && contact.vatNumber
              ? {
                  email: contact.invoiceEmail,
                  name: contact.invoiceName,
                  vatNumber: contact.vatNumber,
                }
              : null,
          kind: "initial",
          paymentId,
          totalCents: items.reduce((sum, item) => sum + item.amountCents, 0),
          url,
        },
        template: "transactional/admin-new-sponsorship",
        to: admin.email,
      })))
    );
  }
  return { events: [], notify };
}
