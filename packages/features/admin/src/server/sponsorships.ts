import { SPONSORSHIP_DURATION_DAYS } from "@smog/config/constants";
import {
  BLOCKING_SPONSORSHIP_STATUSES,
  gesture,
  inList,
  invoiceRequest,
  payment,
  paymentItem,
  ref,
  renderJob,
  type SponsorshipStatus,
  type Statement,
  sponsor,
  sponsorship,
  sponsorshipEvent,
  sponsorshipToken,
  user,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { enqueueOutputs, type JobQueues, type Outputs } from "@smog/jobs";
import {
  cancelPayment,
  createMollie,
  getPayment,
  MollieApiError,
  type MollieClient,
  type MolliePayment,
} from "@smog/payments";
import type { RpcContext } from "@smog/rpc";
import type { InvalidStateReason } from "@smog/sponsorships/schema";
import {
  DAY_MS,
  decodeCursorAs,
  encodeCursor,
  InvalidCursorError,
} from "@smog/utils";
import { createMux } from "@smog/video";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  type AdminPayment,
  type AdminSponsorshipDetail,
  type AdminSponsorshipListQuery,
  type AdminSponsorshipPage,
  type AdminSponsorshipRow,
  mollieDashboardUrl,
  sponsorLogoUrl,
} from "../schema";
import { auditStatement } from "./audit-writer";
import {
  type AdminAfterCommit,
  type AdminDeps,
  adminProcedure,
  type SponsorshipPlan,
} from "./procedure";
import { aliased } from "./sql";

const DURATION_MS = SPONSORSHIP_DURATION_DAYS * DAY_MS;

function ms(date: Date | null): number | null {
  return date === null ? null : date.getTime();
}

/*
 * ---------------------------------------------------------------------
 * Reads: the list (A-04, A-08) and the detail (A-15, A-29).
 * ---------------------------------------------------------------------
 */

/** The keyset position of the last row of a page (newest first). */
export interface SponsorshipPosition {
  createdAt: number;
  id: string;
}

function parseCursor(cursor: string): SponsorshipPosition {
  return decodeCursorAs(cursor, (key) => {
    const [createdAt, id] = key;
    return key.length === 2 &&
      typeof createdAt === "number" &&
      Number.isInteger(createdAt) &&
      typeof id === "string"
      ? { createdAt, id }
      : null;
  });
}

/**
 * Older than the position in `(created_at DESC, id DESC)` order, as a
 * range on the first key so SQLite seeks `sponsorship_created_id_idx`.
 */
function before(position: SponsorshipPosition): SQL | undefined {
  const at = new Date(position.createdAt);
  return and(
    lte(sponsorship.createdAt, at),
    or(lt(sponsorship.createdAt, at), lt(sponsorship.id, position.id))
  );
}

const BLOCKING: readonly SponsorshipStatus[] = BLOCKING_SPONSORSHIP_STATUSES;

/**
 * Whether the `payment` row named `alias` needs the admin: `refund_needed`
 * with no refund recorded yet (ruling 4), or a chargeback while one of its
 * sponsorships still holds its gesture (task 3 fix round 1, I-3). A
 * charged-back payment is `paid`, so cancel (open payments only) does not
 * apply: the admin force-expires a `live`/`expiring` sponsorship or rejects
 * one `in_review`/`changes_requested`; one still `rendering` or
 * `render_failed` stays flagged until its render ends (fix round 1, M7).
 * The dashboard counts these payments, and the list's `refundNeeded`
 * filter finds their sponsorships.
 */
export function paymentNeedsAdmin(alias: string): SQL {
  const p = sql.raw(`"${alias}"`);
  return sql`((${p}.status = 'refund_needed' AND ${p}.refunded_cents = 0) OR (${p}.charged_back_cents > 0 AND EXISTS (SELECT 1 FROM payment_item AS cbi JOIN sponsorship AS cbs ON cbs.id = cbi.sponsorship_id WHERE cbi.payment_id = ${p}.id AND ${inList(sql`cbs.status`, BLOCKING)})))`;
}

/** The outer sponsorship row, for correlated subqueries. */
const outerId = ref("sponsorship", sponsorship.id);

/** Whether a payment of the outer sponsorship needs the admin. */
const needsAdmin = sql`EXISTS (SELECT 1 FROM payment_item AS rni JOIN payment AS rnp ON rnp.id = rni.payment_id WHERE rni.sponsorship_id = ${outerId} AND ${paymentNeedsAdmin("rnp")})`;

/**
 * The checkout's item of the outer sponsorship (its `initial` payment), as
 * JSON: the item amount, the logo flag, the payment status and Mollie id.
 */
export const checkoutItemSql = sql<
  string | null
>`(SELECT json_object('amountCents', ci.amount_cents, 'includesLogo', ci.includes_logo, 'mollieId', cp.mollie_id, 'status', cp.status) FROM payment_item AS ci JOIN payment AS cp ON cp.id = ci.payment_id WHERE ci.sponsorship_id = ${outerId} AND cp.kind = 'initial' LIMIT 1)`;

export interface CheckoutItem {
  amountCents: number;
  includesLogo: boolean;
  mollieId: string | null;
  status: AdminPayment["status"];
}

export function parseCheckoutItem(json: string | null): CheckoutItem | null {
  if (json === null) {
    return null;
  }
  const item = JSON.parse(json) as Omit<CheckoutItem, "includesLogo"> & {
    includesLogo: number;
  };
  return { ...item, includesLogo: item.includesLogo === 1 };
}

const hasInvoice = sql<number>`EXISTS (SELECT 1 FROM invoice_request AS ir WHERE ir.sponsor_id = ${ref("sponsorship", sponsorship.sponsorId)})`;

/**
 * `q` in the gesture name, the display name or the sponsor email,
 * literal: `instr`, not `LIKE` (as `admin.users`). Case is folded for
 * ASCII only (SQLite's `lower` on D1 has no ICU); names also match as
 * typed.
 */
function matches(q: string): SQL {
  const needle = q.toLowerCase();
  return sql`(instr(lower(${gesture.name}), ${needle}) > 0 OR instr(${gesture.name}, ${q}) > 0 OR instr(lower(${sponsorship.displayName}), ${needle}) > 0 OR instr(${sponsorship.displayName}, ${q}) > 0 OR instr(lower(${sponsor.email}), ${needle}) > 0)`;
}

/** The filters every list and export shares, except `status`. */
export function sponsorshipFilters(input: {
  from?: number | undefined;
  paymentId?: string | undefined;
  q?: string | undefined;
  refundNeeded?: boolean | undefined;
  to?: number | undefined;
}): SQL | undefined {
  let refund: SQL | undefined;
  if (input.refundNeeded !== undefined) {
    refund = input.refundNeeded ? needsAdmin : sql`NOT ${needsAdmin}`;
  }
  return and(
    input.q ? matches(input.q) : undefined,
    input.paymentId
      ? sql`${sponsorship.id} IN (SELECT fpi.sponsorship_id FROM payment_item AS fpi WHERE fpi.payment_id = ${input.paymentId})`
      : undefined,
    refund,
    input.from === undefined
      ? undefined
      : gte(sponsorship.createdAt, new Date(input.from)),
    input.to === undefined
      ? undefined
      : lte(sponsorship.createdAt, new Date(input.to))
  );
}

/**
 * `status IN (…)` written as `+status`: the unary `+` keeps SQLite from
 * choosing `sponsorship_status_ends_at_idx` and sorting, so a status tab
 * (the default Review tab) scans `sponsorship_created_id_idx` in order
 * whatever the statistics (fix round 1, M1).
 */
export function statusFilter(
  statuses: readonly SponsorshipStatus[] | undefined
): SQL | undefined {
  return statuses ? inList(sql`+${sponsorship.status}`, statuses) : undefined;
}

/**
 * One page of the list: newest first by `(created_at, id)`, seeking
 * migration 0010's index (exported for the query-plan test).
 */
export function adminSponsorshipsQuery(
  db: Db,
  filters: SQL | undefined,
  position: SponsorshipPosition | null,
  limit: number
) {
  return db
    .select({
      checkout: checkoutItemSql,
      company: sponsor.company,
      createdAt: sponsorship.createdAt,
      displayName: sponsorship.displayName,
      email: sponsor.email,
      endsAt: sponsorship.endsAt,
      gestureId: aliased(gesture.id, "gesture_id_"),
      gestureName: aliased(gesture.name, "gesture_name"),
      gestureSlug: gesture.slug,
      id: aliased(sponsorship.id, "sponsorship_id_"),
      invoice: hasInvoice,
      logoKey: sponsorship.logoKey,
      name: aliased(sponsor.name, "sponsor_name"),
      refundNeeded: sql<number>`${needsAdmin}`,
      startsAt: sponsorship.startsAt,
      status: sponsorship.status,
      updatedAt: sponsorship.updatedAt,
    })
    .from(sponsorship)
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .innerJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
    .where(and(filters, position ? before(position) : undefined))
    .orderBy(desc(sponsorship.createdAt), desc(sponsorship.id))
    .limit(limit);
}

type ListRow = Awaited<ReturnType<typeof adminSponsorshipsQuery>>[number];

function toRow(row: ListRow): AdminSponsorshipRow {
  const checkout = parseCheckoutItem(row.checkout);
  return {
    amountCents: checkout?.amountCents ?? null,
    createdAt: row.createdAt.getTime(),
    displayName: row.displayName,
    endsAt: ms(row.endsAt),
    gesture: {
      id: row.gestureId,
      name: row.gestureName,
      slug: row.gestureSlug,
    },
    hasLogo: checkout?.includesLogo ?? row.logoKey !== null,
    id: row.id,
    invoiceRequested: Boolean(row.invoice),
    paymentStatus: checkout?.status ?? null,
    refundNeeded: Boolean(row.refundNeeded),
    sponsor: { company: row.company, email: row.email, name: row.name },
    startsAt: ms(row.startsAt),
    status: row.status,
    updatedAt: row.updatedAt.getTime(),
  };
}

const NO_COUNTS = {
  awaiting_payment: 0,
  cancelled: 0,
  changes_requested: 0,
  expired: 0,
  expiring: 0,
  in_review: 0,
  live: 0,
  rejected: 0,
  render_failed: 0,
  rendering: 0,
} as const satisfies Record<SponsorshipStatus, 0>;

/** A page and the per-status counts, in one batch. */
async function listSponsorships(
  db: Db,
  input: AdminSponsorshipListQuery
): Promise<AdminSponsorshipPage> {
  const position =
    input.cursor === undefined ? null : parseCursor(input.cursor);
  const shared = sponsorshipFilters(input);
  try {
    const [rows, counts] = await db.batch([
      adminSponsorshipsQuery(
        db,
        and(shared, statusFilter(input.status)),
        position,
        input.limit + 1
      ),
      db
        .select({ n: count(), status: sponsorship.status })
        .from(sponsorship)
        .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
        .innerJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
        .where(shared)
        .groupBy(sponsorship.status),
    ]);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      counts: {
        ...NO_COUNTS,
        ...Object.fromEntries(counts.map((row) => [row.status, row.n])),
      },
      items: page.map(toRow),
      nextCursor:
        rows.length > input.limit && last
          ? encodeCursor([last.createdAt.getTime(), last.id])
          : null,
    };
  } catch (error) {
    console.error("[admin] Failed to list the sponsorships:", error);
    throw error;
  }
}

/** The ids of the payments of a sponsorship (a subquery). */
function paymentsOf(sponsorshipId: string): SQL {
  return sql`(SELECT pp.payment_id FROM payment_item AS pp WHERE pp.sponsorship_id = ${sponsorshipId})`;
}

/** The A-15 / A-29 detail in one batch, or `null` for an unknown id. */
async function getSponsorship(
  db: Db,
  id: string
): Promise<AdminSponsorshipDetail | null> {
  try {
    const [main, payments, items, events, jobs, tokens] = await db.batch([
      db
        .select({
          createdAt: aliased(sponsorship.createdAt, "s_created_at"),
          displayName: sponsorship.displayName,
          endsAt: sponsorship.endsAt,
          gestureId: aliased(gesture.id, "g_id"),
          gestureName: aliased(gesture.name, "g_name"),
          gesturePlaybackId: aliased(gesture.playbackId, "g_playback_id"),
          gestureSlug: gesture.slug,
          id: aliased(sponsorship.id, "s_id"),
          invoiceEmail: aliased(invoiceRequest.email, "i_email"),
          invoiceName: aliased(invoiceRequest.name, "i_name"),
          invoiceVat: invoiceRequest.vatNumber,
          logoKey: sponsorship.logoKey,
          reminderSentAt: sponsorship.reminderSentAt,
          sponsorCompany: sponsor.company,
          sponsorEmail: aliased(sponsor.email, "sp_email"),
          sponsorLocale: sponsor.locale,
          sponsorName: aliased(sponsor.name, "sp_name"),
          startsAt: sponsorship.startsAt,
          status: aliased(sponsorship.status, "s_status"),
          updatedAt: aliased(sponsorship.updatedAt, "s_updated_at"),
          videoPlaybackId: sponsorship.videoPlaybackId,
        })
        .from(sponsorship)
        .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
        .innerJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
        .leftJoin(invoiceRequest, eq(invoiceRequest.sponsorId, sponsor.id))
        .where(eq(sponsorship.id, id))
        .limit(1),
      db
        .select()
        .from(payment)
        .where(sql`${payment.id} IN ${paymentsOf(id)}`)
        .orderBy(asc(payment.createdAt), asc(payment.id)),
      db
        .select({
          amountCents: paymentItem.amountCents,
          gestureId: aliased(gesture.id, "item_gesture_id"),
          gestureName: gesture.name,
          gestureSlug: gesture.slug,
          includesLogo: paymentItem.includesLogo,
          paymentId: paymentItem.paymentId,
          sponsorshipId: paymentItem.sponsorshipId,
          status: aliased(sponsorship.status, "item_status"),
        })
        .from(paymentItem)
        .innerJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
        .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
        .where(sql`${paymentItem.paymentId} IN ${paymentsOf(id)}`)
        .orderBy(asc(gesture.sortName), asc(paymentItem.sponsorshipId)),
      db
        .select({
          actorId: aliased(user.id, "actor_id_"),
          actorName: aliased(user.name, "actor_name"),
          createdAt: aliased(sponsorshipEvent.createdAt, "event_created_at"),
          data: sponsorshipEvent.data,
          id: aliased(sponsorshipEvent.id, "event_id"),
          type: sponsorshipEvent.type,
        })
        .from(sponsorshipEvent)
        .leftJoin(user, eq(user.id, sponsorshipEvent.actorId))
        .where(eq(sponsorshipEvent.sponsorshipId, id))
        // Insertion order within one timestamp (one batch shares `now`).
        .orderBy(
          asc(sponsorshipEvent.createdAt),
          asc(sql`"sponsorship_event".rowid`)
        ),
      db
        .select()
        .from(renderJob)
        .where(eq(renderJob.sponsorshipId, id))
        .orderBy(asc(renderJob.createdAt), asc(renderJob.attempt)),
      db
        .select({
          createdAt: sponsorshipToken.createdAt,
          expiresAt: sponsorshipToken.expiresAt,
          id: sponsorshipToken.id,
          purpose: sponsorshipToken.purpose,
          usedAt: sponsorshipToken.usedAt,
        })
        .from(sponsorshipToken)
        .where(eq(sponsorshipToken.sponsorshipId, id))
        .orderBy(asc(sponsorshipToken.createdAt), asc(sponsorshipToken.id)),
    ]);
    const [row] = main;
    if (!row) {
      return null;
    }
    const s = row;
    const gestureRef = {
      id: row.gestureId,
      name: row.gestureName,
      playbackId: row.gesturePlaybackId,
      slug: row.gestureSlug,
    };
    const checkout = items.find(
      (item) =>
        item.sponsorshipId === id &&
        payments.some((p) => p.id === item.paymentId && p.kind === "initial")
    );
    return {
      events: events.map((event) => ({
        actor:
          event.actorId === null
            ? null
            : { id: event.actorId, name: event.actorName ?? "" },
        createdAt: event.createdAt.getTime(),
        data: event.data,
        id: event.id,
        type: event.type,
      })),
      gesture: gestureRef,
      invoice:
        row.invoiceName === null
          ? null
          : {
              email: row.invoiceEmail ?? "",
              name: row.invoiceName,
              vatNumber: row.invoiceVat ?? "",
            },
      logoUrl: s.logoKey === null ? null : sponsorLogoUrl(s.logoKey),
      payments: payments.map((p) => ({
        amountCents: p.amountCents,
        chargedBackAt: ms(p.chargedBackAt),
        chargedBackCents: p.chargedBackCents,
        createdAt: p.createdAt.getTime(),
        id: p.id,
        items: items
          .filter((item) => item.paymentId === p.id)
          .map((item) => ({
            amountCents: item.amountCents,
            gesture: {
              id: item.gestureId,
              name: item.gestureName,
              slug: item.gestureSlug,
            },
            includesLogo: item.includesLogo,
            sponsorshipId: item.sponsorshipId,
            status: item.status,
          })),
        kind: p.kind,
        mollieDashboardUrl:
          p.mollieId === null ? null : mollieDashboardUrl(p.mollieId),
        mollieId: p.mollieId,
        paidAt: ms(p.paidAt),
        refunded: p.refundedCents > 0 && p.refundedCents >= p.amountCents,
        refundedAt: ms(p.refundedAt),
        refundedCents: p.refundedCents,
        status: p.status,
      })),
      renderJobs: jobs.map((job) => ({
        attempt: job.attempt,
        createdAt: job.createdAt.getTime(),
        error: job.error,
        finishedAt: ms(job.finishedAt),
        id: job.id,
        playbackId: job.playbackId,
        status: job.status,
      })),
      sponsor: {
        company: row.sponsorCompany,
        email: row.sponsorEmail,
        locale: row.sponsorLocale,
        name: row.sponsorName,
      },
      sponsorship: {
        createdAt: s.createdAt.getTime(),
        displayName: s.displayName,
        endsAt: ms(s.endsAt),
        hasLogo: checkout?.includesLogo ?? s.logoKey !== null,
        id: s.id,
        reminderSentAt: ms(s.reminderSentAt),
        startsAt: ms(s.startsAt),
        status: s.status,
        updatedAt: s.updatedAt.getTime(),
      },
      tokens: tokens.map((token) => ({
        createdAt: token.createdAt.getTime(),
        expiresAt: token.expiresAt.getTime(),
        id: token.id,
        purpose: token.purpose,
        usedAt: ms(token.usedAt),
      })),
      video: {
        fakeRender:
          s.videoPlaybackId !== null &&
          s.videoPlaybackId === row.gesturePlaybackId,
        playbackId: s.videoPlaybackId,
      },
    };
  } catch (error) {
    console.error(`[admin] Failed to read the sponsorship ${id}:`, error);
    throw error;
  }
}

/*
 * ---------------------------------------------------------------------
 * Actions (ruling 14).
 * ---------------------------------------------------------------------
 */

/** The typed errors a sponsorship action answers a refusal with. */
interface ActionErrors {
  INVALID_STATE: (options: { data: { reason: InvalidStateReason } }) => Error;
  NOT_FOUND: () => Error;
}

/**
 * Runs an action. A refusal (`refusalOf`) is answered with its typed
 * error; a Mollie failure is `INVALID_STATE paymentProvider`; anything else
 * is logged and rethrown. Never logs a link: the actions' own errors carry
 * none.
 */
async function refusing<T>(
  deps: AdminDeps,
  errors: ActionErrors,
  label: string,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const reason = deps.sponsorships.refusalOf(error);
    if (reason === "notFound") {
      throw errors.NOT_FOUND();
    }
    if (reason) {
      throw errors.INVALID_STATE({ data: { reason } });
    }
    if (error instanceof StaleError) {
      throw errors.INVALID_STATE({ data: { reason: "stale" } });
    }
    if (error instanceof MollieApiError) {
      console.error(`[admin] Mollie failed while trying to ${label}:`, error);
      throw errors.INVALID_STATE({ data: { reason: "paymentProvider" } });
    }
    if (isTypedError(error)) {
      throw error;
    }
    console.error(`[admin] Failed to ${label}:`, error);
    throw error;
  }
}

/** An error the handler already typed (`errors.*`), passed through as is. */
function isTypedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "defined" in error &&
    (error as { defined: unknown }).defined === true
  );
}

/** The change's statements and its audit entries, as one D1 batch. */
async function commit(db: Db, statements: Statement[]): Promise<void> {
  const [first, ...rest] = statements;
  if (!first) {
    throw new Error("[admin] An action built an empty batch");
  }
  await db.batch([first, ...rest]);
}

/** The rpc env's queue bindings, the one way in (task 4's `RpcEnv`). */
function queuesOf(context: RpcContext): JobQueues {
  return {
    email: context.env.EMAIL_QUEUE as JobQueues["email"],
    events: context.env.EVENTS_QUEUE as JobQueues["events"],
  };
}

/** A plan's `after` as `enqueueOutputs` takes it. */
function outputsOf(after: readonly AdminAfterCommit[]): Outputs {
  return {
    events: after.flatMap((item) =>
      item.kind === "event" ? [item.event] : []
    ),
    notify: after.flatMap((item) =>
      item.kind === "email" ? [item.email] : []
    ),
  };
}

/**
 * Enqueues what a committed change asks for (ruling 8). By default a
 * failed send is retried, then logged and swallowed, so the committed
 * change stands. `loud` (mark paid: its `payment.settled` starts the
 * render) throws instead: the admin sees the failure, and task 5's
 * reconciliation sweep re-sends `payment.settled` for a paid payment with
 * an item in `rendering` and no job.
 */
async function enqueueAfter(
  context: RpcContext,
  outputs: Outputs,
  loud = false
): Promise<void> {
  try {
    await enqueueOutputs(
      queuesOf(context),
      outputs,
      loud ? { onFailure: "throw" } : {}
    );
  } catch (error) {
    console.error(
      "[admin] Failed to enqueue after the commit (a missed payment.settled is re-sent by the stale sweep):",
      error
    );
    if (loud) {
      throw error;
    }
  }
}

/** A state that moved on under the action: `INVALID_STATE stale`. */
class StaleError extends Error {
  constructor(message: string) {
    super(`[admin] ${message}`);
    this.name = "StaleError";
  }
}

/**
 * Settles Mollie's payment as the webhook does, with the admin's audit
 * entries (`audits`) in the settlement's final batch (fix round 1, I1),
 * then enqueues its fan-out. Answers the settle outcome; `stale` when the
 * payment is no longer ours (it was found by its Mollie id).
 */
async function settleAndEnqueue(
  deps: AdminDeps,
  context: RpcContext,
  input: { audits: Statement[]; fetched: MolliePayment; now: Date }
): Promise<string> {
  const result = await deps.sponsorships.settle(context.db, {
    extra: input.audits,
    now: input.now,
    payment: input.fetched,
  });
  if (!result) {
    throw new StaleError("the payment is not ours");
  }
  // Loud: the fan-out of a payment the admin acted on starts its render.
  await enqueueAfter(context, result, true);
  return result.outcome;
}

function mollieFor(context: RpcContext, deps: AdminDeps): MollieClient | null {
  return createMollie(context.env, { fetch: deps.mollieFetch });
}

interface PaymentBrief {
  amountCents: number;
  /** The items mark paid moves (`awaiting_payment`; a renewal's one item). */
  changing: ReadonlySet<string>;
  id: string;
  kind: AdminPayment["kind"];
  mollieId: string | null;
  sponsorshipIds: string[];
  status: AdminPayment["status"];
}

async function paymentBrief(
  db: Db,
  paymentId: string
): Promise<PaymentBrief | null> {
  const [rows, items] = await db.batch([
    db
      .select({
        amountCents: payment.amountCents,
        id: payment.id,
        kind: payment.kind,
        mollieId: payment.mollieId,
        status: payment.status,
      })
      .from(payment)
      .where(eq(payment.id, paymentId))
      .limit(1),
    db
      .select({
        id: paymentItem.sponsorshipId,
        status: aliased(sponsorship.status, "item_status"),
      })
      .from(paymentItem)
      .innerJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
      .where(eq(paymentItem.paymentId, paymentId))
      .orderBy(asc(paymentItem.sponsorshipId)),
  ]);
  const [row] = rows;
  if (!row) {
    return null;
  }
  return {
    ...row,
    changing: new Set(
      items
        .filter(
          (item) => row.kind === "renewal" || item.status === "awaiting_payment"
        )
        .map((item) => item.id)
    ),
    sponsorshipIds: items.map((item) => item.id),
  };
}

/**
 * Mollie's view of an open payment before an admin acts on it, or `null`
 * without a Mollie key (staging) or a Mollie payment (a crash before it
 * was created): the action is then local only.
 */
async function mollieView(
  context: RpcContext,
  deps: AdminDeps,
  brief: PaymentBrief
): Promise<{ fetched: MolliePayment; mollie: MollieClient } | null> {
  const mollie = mollieFor(context, deps);
  if (!(mollie && brief.mollieId)) {
    return null;
  }
  const fetched = await getPayment(mollie, brief.mollieId);
  return fetched ? { fetched, mollie } : null;
}

/**
 * Cancels at Mollie while it can, **after** the local commit (fix round 1,
 * I2): best effort, a failure is logged, never thrown. Mollie's later
 * `canceled` webhook then finds our payment final and changes nothing; if
 * the customer pays in between, ruling 6 flags it (`refund_needed`, paid
 * twice) or revives it (late paid).
 */
async function cancelAtMollie(
  view: { fetched: MolliePayment; mollie: MollieClient } | null
): Promise<void> {
  if (!view?.fetched.isCancelable) {
    return;
  }
  try {
    await cancelPayment(view.mollie, view.fetched.id);
  } catch (error) {
    console.error(
      `[admin] Failed to cancel the Mollie payment ${view.fetched.id} after the local change:`,
      error
    );
  }
}

/** Deletes the sponsored Mux asset (as the expiry sweep); logged, never thrown. */
async function deleteSponsoredAsset(
  context: RpcContext,
  deps: AdminDeps,
  assetId: string
): Promise<void> {
  const mux = createMux(context.env, { fetch: deps.muxFetch });
  if (!mux) {
    console.warn(
      `[admin] Mux is not configured: the sponsored asset ${assetId} stays`
    );
    return;
  }
  try {
    const response = await mux.fetch(
      `${mux.apiUrl}/video/v1/assets/${encodeURIComponent(assetId)}`,
      { headers: { authorization: mux.authorization }, method: "DELETE" }
    );
    await response.body?.cancel();
    if (!(response.ok || response.status === 404)) {
      throw new Error(`Mux answered ${response.status}`);
    }
  } catch (error) {
    console.error(
      `[admin] Failed to delete the sponsored asset ${assetId}:`,
      error
    );
  }
}

async function forceExpireTarget(db: Db, id: string) {
  const [row] = await db
    .select({ gestureName: gesture.name, status: sponsorship.status })
    .from(sponsorship)
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .where(eq(sponsorship.id, id))
    .limit(1);
  return row;
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const isoAt = (epochMs: number): string => new Date(epochMs).toISOString();

/**
 * The `sponsorships` slice of the admin router (phase 6 task 6). Each
 * action asks `@smog/sponsorships` (through `AdminDeps.sponsorships`) for
 * its guarded batch, appends its audit entries, commits once, then
 * enqueues what the plan asks for.
 */
export function sponsorshipsRoutes(deps: AdminDeps) {
  const procedures = adminProcedure.sponsorships;
  const services = deps.sponsorships;

  /** One action on one sponsorship: its plan plus one audit entry, one batch. */
  async function run(
    context: RpcContext,
    plan: SponsorshipPlan,
    audit: Statement
  ): Promise<void> {
    await commit(context.db, [...plan.statements, audit]);
    await enqueueAfter(context, outputsOf(plan.after));
  }

  return {
    sponsorships: {
      approve: procedures.approve.handler(({ context, errors, input }) =>
        refusing(deps, errors, `approve ${input.id}`, async () => {
          const now = new Date();
          const plan = await services.approve(context.db, {
            actorId: context.user.id,
            now,
            siteUrl: context.env.SITE_URL,
            sponsorshipId: input.id,
          });
          await run(
            context,
            plan,
            auditStatement(context.db, {
              action: "sponsorship.approve",
              actorId: context.user.id,
              data: {
                endsAt: isoAt(now.getTime() + DURATION_MS),
                startsAt: now.toISOString(),
              },
              targetId: input.id,
              targetType: "sponsorship",
            })
          );
          return { id: input.id, status: "live" as const };
        })
      ),
      cancel: procedures.cancel.handler(({ context, errors, input }) =>
        refusing(
          deps,
          errors,
          `cancel payment ${input.paymentId}`,
          async () => {
            const brief = await paymentBrief(context.db, input.paymentId);
            if (!brief) {
              throw errors.NOT_FOUND();
            }
            if (brief.status !== "open") {
              throw errors.INVALID_STATE({ data: { reason: "stale" } });
            }
            const now = new Date();
            const view = await mollieView(context, deps, brief);
            if (view?.fetched.status === "paid") {
              // The money arrived: settle it as the webhook would, with the
              // refused cancel audited in the settlement's batch, and refuse.
              await settleAndEnqueue(deps, context, {
                audits: brief.sponsorshipIds.map((id) =>
                  auditStatement(context.db, {
                    action: "sponsorship.cancel",
                    actorId: context.user.id,
                    data: { paymentId: brief.id, refused: "paid" },
                    targetId: id,
                    targetType: "sponsorship",
                  })
                ),
                fetched: view.fetched,
                now,
              });
              throw errors.INVALID_STATE({ data: { reason: "paid" } });
            }
            const plan = await services.cancelPayment(context.db, {
              actorId: context.user.id,
              now,
              paymentId: input.paymentId,
            });
            await commit(context.db, [
              ...plan.statements,
              ...plan.sponsorshipIds.map((id) =>
                auditStatement(context.db, {
                  action: "sponsorship.cancel",
                  actorId: context.user.id,
                  data: { paymentId: input.paymentId },
                  targetId: id,
                  targetType: "sponsorship",
                })
              ),
            ]);
            await cancelAtMollie(view);
            await enqueueAfter(context, outputsOf(plan.after));
            return {
              paymentId: input.paymentId,
              result: "canceled" as const,
              sponsorshipIds: plan.sponsorshipIds,
            };
          }
        )
      ),
      forceExpire: procedures.forceExpire.handler(
        ({ context, errors, input }) =>
          refusing(deps, errors, `force expire ${input.id}`, async () => {
            const target = await forceExpireTarget(context.db, input.id);
            if (!target) {
              throw errors.NOT_FOUND();
            }
            if (!sameName(input.confirmName, target.gestureName)) {
              throw errors.VALIDATION({
                data: {
                  fieldErrors: { confirmName: ["mismatch"] },
                  formErrors: [],
                },
              });
            }
            const plan = await services.forceExpire(context.db, {
              actorId: context.user.id,
              now: new Date(),
              sponsorshipId: input.id,
            });
            await run(
              context,
              plan,
              auditStatement(context.db, {
                action: "sponsorship.force_expire",
                actorId: context.user.id,
                data: {
                  deletesAsset: plan.muxAssetId !== null,
                  from: target.status === "expiring" ? "expiring" : "live",
                },
                targetId: input.id,
                targetType: "sponsorship",
              })
            );
            if (plan.muxAssetId) {
              await deleteSponsoredAsset(context, deps, plan.muxAssetId);
            }
            return { id: input.id, status: "expired" as const };
          })
      ),
      get: procedures.get.handler(async ({ context, errors, input }) => {
        const detail = await getSponsorship(context.db, input.id);
        if (!detail) {
          throw errors.NOT_FOUND();
        }
        return detail;
      }),
      list: procedures.list.handler(async ({ context, errors, input }) => {
        try {
          return await listSponsorships(context.db, input);
        } catch (error) {
          if (error instanceof InvalidCursorError) {
            throw errors.VALIDATION({
              data: { fieldErrors: { cursor: ["invalid"] }, formErrors: [] },
            });
          }
          throw error;
        }
      }),
      markPaid: procedures.markPaid.handler(({ context, errors, input }) =>
        refusing(
          deps,
          errors,
          `mark payment ${input.paymentId} paid`,
          async () => {
            const brief = await paymentBrief(context.db, input.paymentId);
            if (!brief) {
              throw errors.NOT_FOUND();
            }
            if (brief.status !== "open") {
              throw errors.INVALID_STATE({ data: { reason: "stale" } });
            }
            const now = new Date();
            const view = await mollieView(context, deps, brief);
            const note = input.note ? { note: input.note } : {};
            if (view?.fetched.status === "paid") {
              // Mollie has the money: settled normally (ruling 14), with
              // the admin's entries in the settlement's batch (I1).
              const outcome = await settleAndEnqueue(deps, context, {
                audits: brief.sponsorshipIds.map((id) =>
                  auditStatement(context.db, {
                    action: "sponsorship.mark_paid",
                    actorId: context.user.id,
                    data: { paymentId: brief.id, source: "mollie", ...note },
                    targetId: id,
                    targetType: "sponsorship",
                  })
                ),
                fetched: view.fetched,
                now,
              });
              return {
                paymentId: brief.id,
                result:
                  outcome === "refund_needed"
                    ? ("refund_needed" as const)
                    : ("settled" as const),
                sponsorshipIds: brief.sponsorshipIds,
              };
            }
            const plan = await services.markPaid(context.db, {
              actorId: context.user.id,
              now,
              paymentId: input.paymentId,
              ...note,
            });
            // Committed first, then cancelled at Mollie (I2).
            await commit(context.db, [
              ...plan.statements,
              ...plan.sponsorshipIds.map((id) =>
                auditStatement(context.db, {
                  action: "sponsorship.mark_paid",
                  actorId: context.user.id,
                  data: {
                    paymentId: input.paymentId,
                    source: "manual",
                    ...note,
                    // An item this payment did not move (M8).
                    ...(brief.changing.has(id) ? {} : { changed: false }),
                  },
                  targetId: id,
                  targetType: "sponsorship",
                })
              ),
            ]);
            await cancelAtMollie(view);
            // Loud: `payment.settled` starts the render (the sweep is the backstop).
            await enqueueAfter(context, outputsOf(plan.after), true);
            return {
              paymentId: input.paymentId,
              result: "marked_paid" as const,
              sponsorshipIds: plan.sponsorshipIds,
            };
          }
        )
      ),
      recordRefund: procedures.recordRefund.handler(
        ({ context, errors, input }) =>
          refusing(
            deps,
            errors,
            `record the refund of payment ${input.paymentId}`,
            async () => {
              const brief = await paymentBrief(context.db, input.paymentId);
              if (!brief) {
                throw errors.NOT_FOUND();
              }
              const mollie = mollieFor(context, deps);
              if (!mollie) {
                throw errors.INVALID_STATE({
                  data: { reason: "paymentsUnavailable" },
                });
              }
              const fetched = brief.mollieId
                ? await getPayment(mollie, brief.mollieId)
                : null;
              if (!fetched) {
                throw errors.INVALID_STATE({ data: { reason: "notRefunded" } });
              }
              const plan = await services.recordRefund(context.db, {
                now: new Date(),
                payment: fetched,
                paymentId: input.paymentId,
              });
              await run(
                context,
                plan,
                auditStatement(context.db, {
                  action: "payment.refund",
                  actorId: context.user.id,
                  data: {
                    amountCents: plan.amountCents,
                    refundedCents: plan.refundedCents,
                  },
                  targetId: input.paymentId,
                  targetType: "payment",
                })
              );
              return {
                amountCents: plan.amountCents,
                paymentId: input.paymentId,
                refundedCents: plan.refundedCents,
              };
            }
          )
      ),
      regenerateToken: procedures.regenerateToken.handler(
        ({ context, errors, input }) =>
          refusing(
            deps,
            errors,
            `regenerate the ${input.purpose} link of ${input.id}`,
            async () => {
              const plan = await services.regenerateToken(context.db, {
                actorId: context.user.id,
                now: new Date(),
                purpose: input.purpose,
                siteUrl: context.env.SITE_URL,
                sponsorshipId: input.id,
              });
              // Only the expiry: the link (its raw token) is never stored.
              await run(
                context,
                plan,
                auditStatement(context.db, {
                  action: "sponsorship.regenerate_token",
                  actorId: context.user.id,
                  data: {
                    expiresAt: isoAt(plan.expiresAt),
                    purpose: input.purpose,
                  },
                  targetId: input.id,
                  targetType: "sponsorship",
                })
              );
              return { expiresAt: plan.expiresAt, url: plan.url };
            }
          )
      ),
      reject: procedures.reject.handler(({ context, errors, input }) =>
        refusing(deps, errors, `reject ${input.id}`, async () => {
          const plan = await services.reject(context.db, {
            actorId: context.user.id,
            now: new Date(),
            reason: input.reason,
            sponsorshipId: input.id,
          });
          await run(
            context,
            plan,
            auditStatement(context.db, {
              action: "sponsorship.reject",
              actorId: context.user.id,
              data: { reason: input.reason },
              targetId: input.id,
              targetType: "sponsorship",
            })
          );
          return { id: input.id, status: "rejected" as const };
        })
      ),
      requestChanges: procedures.requestChanges.handler(
        ({ context, errors, input }) =>
          refusing(
            deps,
            errors,
            `request changes for ${input.id}`,
            async () => {
              const plan = await services.requestChanges(context.db, {
                actorId: context.user.id,
                now: new Date(),
                siteUrl: context.env.SITE_URL,
                sponsorshipId: input.id,
              });
              // Only the expiry: the link (its raw token) is never stored.
              await run(
                context,
                plan,
                auditStatement(context.db, {
                  action: "sponsorship.request_changes",
                  actorId: context.user.id,
                  data: { expiresAt: isoAt(plan.expiresAt) },
                  targetId: input.id,
                  targetType: "sponsorship",
                })
              );
              return { expiresAt: plan.expiresAt, url: plan.url };
            }
          )
      ),
    },
  };
}
