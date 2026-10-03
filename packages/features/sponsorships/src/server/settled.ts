/**
 * The `payment.settled` fan-out (rulings 7 and 8), which the site's
 * `EVENTS_QUEUE` consumer runs. Everything is derived from D1 on every
 * run, so a duplicate or retried message is safe:
 * - each item in `rendering` without a `queued`/`running` job gets one
 *   (`createRenderJob`: the in-batch guards make it one job however many
 *   messages run), and `render.requested` is returned for every item's
 *   `queued` job (the start is idempotent: it acts on a queued job only);
 * - an initial payment: `sponsorship_received` and `payment_confirmed` per
 *   sponsorship, and `admin_new_sponsorship` per admin;
 * - a renewal: `payment_confirmed` with the new end.
 * Every email has its idempotency key (ruling 8). Only items past payment
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
  renderJob,
  type SponsorshipStatus,
  sponsor,
  sponsorship,
  sponsorshipEvent,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import type { OutboxEmail } from "@smog/email";
import type { EventMessage } from "@smog/jobs";
import { type RenderInput, renderInputSchema } from "@smog/render/contract";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Outputs } from "./dispatch";
import { emailAdmins } from "./recipients";
import { createRenderJob } from "./render";

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

/** The queued job of a sponsorship, if any. */
async function queuedJobOf(
  db: Db,
  sponsorshipId: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: renderJob.id })
    .from(renderJob)
    .where(
      and(
        eq(renderJob.sponsorshipId, sponsorshipId),
        eq(renderJob.status, "queued")
      )
    )
    .limit(1);
  return row?.id ?? null;
}

/** One job per rendering item; `render.requested` for each queued one. */
async function renderRequests(
  db: Db,
  items: readonly ItemRow[],
  now: Date
): Promise<EventMessage[]> {
  const events: EventMessage[] = [];
  for (const item of items) {
    if (item.status !== "rendering") {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one guarded batch per item, so one race fails only its own item.
    const created = await createRenderJob(db, {
      now,
      sponsorshipId: item.sponsorshipId,
    });
    const renderJobId =
      created?.renderJobId ?? (await queuedJobOf(db, item.sponsorshipId));
    if (renderJobId) {
      events.push({ renderJobId, type: "render.requested" });
    }
  }
  return events;
}

/**
 * The fan-out of one settled payment (see the module comment): render
 * jobs are written here; the returned events and emails are for the
 * caller to enqueue.
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
  const events = await renderRequests(db, items, now);
  const contact = await sponsorOf(db, first.sponsorshipId);
  if (!contact) {
    return { events, notify: [] };
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
  return { events, notify };
}

/**
 * A `queued` render job and its input, for `render.requested`; `null` for
 * an unknown job or one that already started or finished (acked).
 */
export async function queuedRenderJob(
  db: Db,
  renderJobId: string
): Promise<{ input: RenderInput; renderJobId: string } | null> {
  const [row] = await db
    .select({ input: renderJob.input, status: renderJob.status })
    .from(renderJob)
    .where(eq(renderJob.id, renderJobId))
    .limit(1);
  if (row?.status !== "queued") {
    return null;
  }
  const input = renderInputSchema.safeParse(row.input);
  if (!input.success) {
    console.error(
      `[sponsorships] Render job ${renderJobId} has an invalid input; not started`
    );
    return null;
  }
  return { input: input.data, renderJobId };
}
