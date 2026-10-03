/**
 * The lifecycle crons (spec §8.1, ruling 9). Each is a function of
 * `{ db, now, … }` that the site's `scheduled()` handler calls
 * (`apps/site/src/worker/scheduled.ts`) and that returns its counts, which
 * the handler logs as `[cron] <name> …`. Every per-record step is one D1
 * batch whose guards make it idempotent: a record a second run (or a
 * concurrent writer) already handled is a no-op, and a record that fails
 * is logged and skipped, so the next run continues.
 *
 * - `runExpirySweep` (J-01, daily 00:00 UTC)
 * - `runReminderSweep` (J-02, daily 08:00 UTC)
 * - `runStaleSweep` (J-03, hourly)
 * - `runRetentionPurge` (J-04, daily 03:15 UTC)
 */
import {
  gesture,
  inList,
  type PaymentKind,
  payment,
  paymentItem,
  type RetentionTable,
  ref,
  renderJob,
  runRetentionPurges,
  type SponsorshipStatus,
  type Statement,
  sponsor,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import type { EmailOutbox, OutboxEmail } from "@smog/email";
import {
  type EventMessage,
  enqueueEvent,
  type QueueProducer,
} from "@smog/jobs";
import {
  cancelPayment,
  getPayment,
  type MollieClient,
  type MolliePayment,
  mapMollieStatus,
} from "@smog/payments";
import { DAY_MS } from "@smog/utils";
import { deleteAsset, type Mux } from "@smog/video";
import { and, asc, eq, gt, isNull, lt, lte, ne, not, sql } from "drizzle-orm";
import {
  type LogoBucket,
  orphanLogoSweep,
  releaseTerminalLogos,
  TERMINAL_LOGO_STATUSES,
} from "./orphan-logos";
import { type SettleResult, settlePayment } from "./settle";
import {
  isStalePayment,
  issueTokenStatements,
  paymentGuard,
} from "./statements";
import { isStaleTransition, transitionStatements } from "./transition";

/** The reminder goes out when the end is at most 30 days away (J-02). */
export const REMINDER_WINDOW_MS = 30 * DAY_MS;
/** An open payment older than this is settled or cancelled (J-03, D-STALE). */
export const STALE_PAYMENT_AGE_MS = DAY_MS;
/** Rows read per page. */
const SWEEP_PAGE_SIZE = 100;
/** Pages per sweep per run; whatever is left waits for the next run. */
const SWEEP_MAX_PAGES = 20;

/** Whether a batch lost a race: another writer moved the row on first. */
function lostRace(error: unknown): boolean {
  return isStaleTransition(error) || isStalePayment(error);
}

async function run(db: Db, statements: Statement[]): Promise<void> {
  const [first, ...rest] = statements;
  if (first) {
    await db.batch([first, ...rest]);
  }
}

/**
 * Reads pages of `page(skip)` and handles each row with `handle` until a
 * page comes back short or `SWEEP_MAX_PAGES` were read. Every handled row
 * leaves the set the page reads (its status or column changed), and the
 * rows `handle` leaves in place are added to `skip`, so no row is read
 * twice in one run.
 */
async function sweep<Row extends { id: string }>(
  page: (skip: readonly string[]) => Promise<Row[]>,
  handle: (row: Row) => Promise<"done" | "skip">
): Promise<void> {
  const skip: string[] = [];
  for (let round = 0; round < SWEEP_MAX_PAGES; round += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each page reads what the last one left.
    const rows = await page(skip);
    for (const row of rows) {
      // biome-ignore lint/performance/noAwaitInLoops: one record per D1 batch (spec §8.1), in order.
      if ((await handle(row)) === "skip") {
        skip.push(row.id);
      }
    }
    if (rows.length < SWEEP_PAGE_SIZE) {
      return;
    }
  }
}

// ── Expiry (J-01) ──────────────────────────────────────────────────────

export interface ExpirySweepResult {
  /** Sponsored Mux assets deleted. */
  assetsDeleted: number;
  /** Mux failures (logged and swallowed; the asset is left). */
  assetsFailed: number;
  /** Assets left because the Mux credentials are not set (logged). */
  assetsSkipped: number;
  expired: number;
  /** Sponsorships whose batch failed (logged; the next run retries). */
  failed: number;
}

const EXPIRING: readonly SponsorshipStatus[] = ["live", "expiring"];

/**
 * Whether `assetId` must stay: a gesture's own video, or the video of
 * another sponsorship that has not ended. The fake render (ruling 7)
 * stores no asset id, and phase 7's renders get their own assets; this is
 * the belt to those braces.
 */
async function assetInUse(
  db: Db,
  assetId: string,
  sponsorshipId: string
): Promise<boolean> {
  const [byGesture] = await db
    .select({ id: gesture.id })
    .from(gesture)
    .where(eq(gesture.muxAssetId, assetId))
    .limit(1);
  if (byGesture) {
    return true;
  }
  const [bySponsorship] = await db
    .select({ id: sponsorship.id })
    .from(sponsorship)
    .where(
      and(
        eq(sponsorship.videoAssetId, assetId),
        ne(sponsorship.id, sponsorshipId),
        not(inList(sponsorship.status, TERMINAL_LOGO_STATUSES))
      )
    )
    .limit(1);
  return Boolean(bySponsorship);
}

/**
 * `live`/`expiring` sponsorships whose `ends_at` is past become `expired`
 * (`expired`), one batch each. Then the sponsored Mux asset is deleted,
 * when `video_asset_id` is set and no gesture or running sponsorship uses
 * it; a Mux failure is logged and swallowed, and the asset is left (J-01).
 * A second run finds nothing: the rows are `expired`.
 */
export async function runExpirySweep({
  db,
  mux,
  now,
}: {
  db: Db;
  mux: Mux | null;
  now: Date;
}): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = {
    assetsDeleted: 0,
    assetsFailed: 0,
    assetsSkipped: 0,
    expired: 0,
    failed: 0,
  };
  for (const status of EXPIRING) {
    // biome-ignore lint/performance/noAwaitInLoops: two statuses, each its own index seek.
    await sweep(
      async (skip) =>
        await db
          .select({
            gestureAssetId: gesture.muxAssetId,
            id: sponsorship.id,
            videoAssetId: sponsorship.videoAssetId,
          })
          .from(sponsorship)
          .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
          .where(
            and(
              eq(sponsorship.status, status),
              lt(sponsorship.endsAt, now),
              not(inList(sponsorship.id, skip))
            )
          )
          .orderBy(asc(sponsorship.endsAt))
          .limit(SWEEP_PAGE_SIZE),
      async (row) => {
        try {
          await run(
            db,
            transitionStatements(db, {
              actorId: null,
              data: {},
              event: "expired",
              from: status,
              now,
              sponsorshipId: row.id,
            })
          );
        } catch (error) {
          if (!lostRace(error)) {
            result.failed += 1;
            console.error(
              `[sponsorships] Failed to expire sponsorship ${row.id}:`,
              error
            );
          }
          return "skip";
        }
        result.expired += 1;
        await deleteSponsoredAsset(db, mux, row, result);
        return "done";
      }
    );
  }
  return result;
}

async function deleteSponsoredAsset(
  db: Db,
  mux: Mux | null,
  row: {
    gestureAssetId: string | null;
    id: string;
    videoAssetId: string | null;
  },
  result: ExpirySweepResult
): Promise<void> {
  const assetId = row.videoAssetId;
  if (!assetId || assetId === row.gestureAssetId) {
    return;
  }
  try {
    if (await assetInUse(db, assetId, row.id)) {
      return;
    }
    if (!mux) {
      result.assetsSkipped += 1;
      console.warn(
        `[sponsorships] The Mux credentials are not set: the asset ${assetId} of sponsorship ${row.id} is left`
      );
      return;
    }
    if (await deleteAsset(mux, assetId)) {
      result.assetsDeleted += 1;
    }
  } catch (error) {
    result.assetsFailed += 1;
    console.error(
      `[sponsorships] Failed to delete the Mux asset ${assetId} of sponsorship ${row.id}:`,
      error
    );
  }
}

// ── Renewal reminder (J-02) ────────────────────────────────────────────

export interface ReminderSweepResult {
  /** Reminders committed whose email could not be queued (logged). */
  emailFailed: number;
  /** Sponsorships whose batch failed (logged; the next run retries). */
  failed: number;
  reminded: number;
}

/**
 * `live` sponsorships with `now < ends_at ≤ now + 30 d` and no
 * `reminder_sent_at` become `expiring` (`reminder_sent`), with
 * `reminder_sent_at` set and a `renewal` token that expires at `ends_at`
 * (`token_issued`), in one batch each (J-02). Then the `renewal_reminder`
 * email is handed to `email`, keyed `renewal_reminder:<id>:<ends_at ms>`.
 * Nothing else is ever emailed: only the sponsor of a sponsorship that is
 * live and inside its last 30 days, once (the status guard and
 * `reminder_sent_at`). A failed hand-off is logged; the admin can
 * regenerate the link (ruling 11).
 */
export async function runReminderSweep({
  db,
  email,
  now,
  siteUrl,
}: {
  db: Db;
  email: EmailOutbox;
  now: Date;
  siteUrl: string;
}): Promise<ReminderSweepResult> {
  const result: ReminderSweepResult = {
    emailFailed: 0,
    failed: 0,
    reminded: 0,
  };
  const site = siteUrl.replace(TRAILING_SLASHES, "");
  const until = new Date(now.getTime() + REMINDER_WINDOW_MS);
  await sweep(
    async (skip) =>
      await db
        .select({
          endsAt: sponsorship.endsAt,
          gestureName: gesture.name,
          id: sponsorship.id,
          sponsorEmail: sponsor.email,
          sponsorLocale: sponsor.locale,
          sponsorName: sponsor.name,
        })
        .from(sponsorship)
        .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
        .innerJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
        .where(
          and(
            eq(sponsorship.status, "live"),
            gt(sponsorship.endsAt, now),
            lte(sponsorship.endsAt, until),
            isNull(sponsorship.reminderSentAt),
            not(inList(sponsorship.id, skip))
          )
        )
        .orderBy(asc(sponsorship.endsAt))
        .limit(SWEEP_PAGE_SIZE),
    async (row) => {
      const { endsAt } = row;
      if (!endsAt) {
        return "skip";
      }
      let token: string;
      try {
        const issued = await issueTokenStatements(db, {
          actorId: null,
          expiresAt: endsAt,
          now,
          purpose: "renewal",
          sponsorshipId: row.id,
        });
        await run(db, [
          ...issued.statements,
          ...transitionStatements(db, {
            actorId: null,
            data: { endsAt: endsAt.toISOString() },
            event: "reminder_sent",
            from: "live",
            now,
            patch: { reminderSentAt: now },
            sponsorshipId: row.id,
          }),
        ]);
        ({ token } = issued);
      } catch (error) {
        if (!lostRace(error)) {
          result.failed += 1;
          console.error(
            `[sponsorships] Failed to send the renewal reminder of sponsorship ${row.id}:`,
            error
          );
        }
        return "skip";
      }
      result.reminded += 1;
      try {
        await email.send({
          idempotencyKey: `renewal_reminder:${row.id}:${endsAt.getTime()}`,
          locale: row.sponsorLocale,
          props: {
            endsAt: endsAt.toISOString(),
            gestureName: row.gestureName,
            name: row.sponsorName,
            url: `${site}/sponsor/renew?token=${encodeURIComponent(token)}`,
          },
          template: "transactional/renewal-reminder",
          to: row.sponsorEmail,
        });
      } catch (error) {
        result.emailFailed += 1;
        console.error(
          `[sponsorships] Failed to queue the renewal reminder for ${row.id}:`,
          error
        );
      }
      return "done";
    }
  );
  return result;
}

const TRAILING_SLASHES = /\/+$/;

// ── Stale payments (J-03) ──────────────────────────────────────────────

export interface StaleSweepResult {
  /** Payments that ended (cancelled here, or failed/expired at Mollie). */
  cancelled: number;
  /** Of those, the ones cancelled in Mollie by this sweep. */
  cancelledAtMollie: number;
  /** Mollie could not be asked or would not cancel; the next hour retries. */
  deferred: number;
  /** Payments whose local batch failed (logged). */
  failed: number;
  /**
   * Paid payments whose `payment.settled` was re-sent because an item sat
   * in `rendering` without a `queued`/`running` render job (the
   * reconciliation step).
   */
  resent: number;
  /** Payments Mollie reports paid, settled (never cancelled). */
  settled: number;
}

interface StaleRow {
  id: string;
  kind: PaymentKind;
  mollieId: string | null;
}

/** The fan-out and the admin emails of a settle (ruling 8: after the batch). */
async function deliver(
  outcome: SettleResult,
  events: QueueProducer<EventMessage> | undefined,
  email: EmailOutbox
): Promise<void> {
  for (const event of outcome.events) {
    if (events) {
      // biome-ignore lint/performance/noAwaitInLoops: one message per event, in order.
      await enqueueEvent(events, event);
    } else {
      console.error(
        `[sponsorships] No EVENTS_QUEUE: ${event.type} for payment ${outcome.paymentId} was not queued`
      );
    }
  }
  for (const message of outcome.notify) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one message per admin, in order.
      await email.send(message as OutboxEmail);
    } catch (error) {
      console.error(
        `[sponsorships] Failed to queue ${message.template} for payment ${outcome.paymentId}:`,
        error
      );
    }
  }
}

/**
 * Cancels our open payment without Mollie (no key, no `mollie_id`, or a
 * payment Mollie does not know): the payment becomes `canceled`, and for
 * an initial payment every `awaiting_payment` item `cancelled`
 * (`{ reason: "stale" }`), so the gestures are free. A renewal only marks
 * the payment: the sponsorship runs to its end.
 */
async function cancelLocally(db: Db, row: StaleRow, now: Date): Promise<void> {
  const items = await db
    .select({ sponsorshipId: sponsorship.id, status: sponsorship.status })
    .from(paymentItem)
    .innerJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
    .where(eq(paymentItem.paymentId, row.id));
  await run(db, [
    paymentGuard(db, row.id, ["open"]),
    db
      .update(payment)
      .set({ status: "canceled", updatedAt: now })
      .where(eq(payment.id, row.id)),
    ...(row.kind === "initial"
      ? items
          .filter((item) => item.status === "awaiting_payment")
          .flatMap((item) =>
            transitionStatements(db, {
              actorId: null,
              data: { paymentId: row.id, reason: "stale" },
              event: "cancelled",
              from: "awaiting_payment",
              now,
              sponsorshipId: item.sponsorshipId,
            })
          )
      : []),
  ]);
}

type StaleStep = "settled" | "cancelled" | "local" | "deferred";

/**
 * Mollie's view first (D-STALE): paid is settled, never cancelled; open
 * and cancelable is cancelled in Mollie and settled as such; an ended
 * payment is settled as it ended. `local` when Mollie cannot settle it
 * (no key, no id, unknown to Mollie, open and not cancelable).
 */
async function staleAtMollie(
  context: {
    db: Db;
    email: EmailOutbox;
    events: QueueProducer<EventMessage> | undefined;
    mollie: MollieClient;
    now: Date;
    result: StaleSweepResult;
  },
  row: StaleRow & { mollieId: string }
): Promise<StaleStep> {
  const { db, mollie, now, result } = context;
  let fetched: MolliePayment | null;
  try {
    fetched = await getPayment(mollie, row.mollieId);
    if (
      fetched &&
      mapMollieStatus(fetched.status) === "open" &&
      fetched.isCancelable
    ) {
      fetched = await cancelPayment(mollie, fetched.id);
      result.cancelledAtMollie += 1;
    }
  } catch (error) {
    console.error(
      `[sponsorships] Failed to reach Mollie for the stale payment ${row.id}; the next run retries:`,
      error
    );
    return "deferred";
  }
  if (!fetched || mapMollieStatus(fetched.status) === "open") {
    return "local";
  }
  const outcome = await settlePayment(db, { now, payment: fetched });
  if (!outcome) {
    // Found by our own `mollie_id`, so this cannot happen; never cancel
    // what Mollie may report paid.
    console.error(
      `[sponsorships] Mollie's ${fetched.id} did not settle payment ${row.id}`
    );
    return "deferred";
  }
  await deliver(outcome, context.events, context.email);
  return mapMollieStatus(fetched.status) === "paid" ? "settled" : "cancelled";
}

/**
 * Every `open` payment created more than 24 h ago (J-03, D-STALE): re-fetched
 * from Mollie first, then settled (paid), or cancelled in Mollie when it is
 * cancelable and settled as cancelled, or cancelled locally when Mollie
 * cannot settle it. Without `MOLLIE_API_KEY` (`mollie` is `null`: staging)
 * or without a `mollie_id` it is cancelled locally only. A Mollie error
 * leaves the payment open for the next hour.
 */
export async function runStaleSweep({
  db,
  email,
  events,
  mollie,
  now,
}: {
  db: Db;
  email: EmailOutbox;
  events: QueueProducer<EventMessage> | undefined;
  mollie: MollieClient | null;
  now: Date;
}): Promise<StaleSweepResult> {
  const result: StaleSweepResult = {
    cancelled: 0,
    cancelledAtMollie: 0,
    deferred: 0,
    failed: 0,
    resent: 0,
    settled: 0,
  };
  const before = new Date(now.getTime() - STALE_PAYMENT_AGE_MS);
  await sweep(
    async (skip) =>
      await db
        .select({
          id: payment.id,
          kind: payment.kind,
          mollieId: payment.mollieId,
        })
        .from(payment)
        .where(
          and(
            eq(payment.status, "open"),
            lt(payment.createdAt, before),
            not(inList(payment.id, skip))
          )
        )
        .orderBy(asc(payment.createdAt))
        .limit(SWEEP_PAGE_SIZE),
    async (row) => {
      try {
        const step =
          mollie && row.mollieId
            ? await staleAtMollie(
                { db, email, events, mollie, now, result },
                { ...row, mollieId: row.mollieId }
              )
            : "local";
        if (step === "deferred") {
          result.deferred += 1;
          return "skip";
        }
        if (step === "local") {
          await cancelLocally(db, row, now);
          result.cancelled += 1;
          return "done";
        }
        result[step] += 1;
        return "done";
      } catch (error) {
        if (!lostRace(error)) {
          result.failed += 1;
          console.error(
            `[sponsorships] Failed to settle the stale payment ${row.id}:`,
            error
          );
        }
        return "skip";
      }
    }
  );
  result.resent = await resendSettled(db, events, now);
  return result;
}

/** At most this many payments are re-sent per run (the next hour continues). */
export const RECONCILE_MAX_PAYMENTS = 100;
/**
 * A payment paid this recently may still have its `payment.settled` in
 * flight: the reconciliation leaves it to the next run.
 */
export const RECONCILE_GRACE_MS = 5 * 60_000;

/**
 * The reconciliation step of the hourly sweep (task 4 review): every paid
 * payment with an item in `rendering` and no `queued`/`running` render
 * job gets `payment.settled` again, so a fan-out lost after the commit (a
 * crash, a queue outage past the retries, a dead-lettered message) is
 * resumed. Idempotent: the consumer creates at most one job per item in
 * D1 and keys its emails, so a re-send that races the original changes
 * nothing. Bounded to `RECONCILE_MAX_PAYMENTS` per run. Returns how many
 * were re-sent.
 */
async function resendSettled(
  db: Db,
  events: QueueProducer<EventMessage> | undefined,
  now: Date
): Promise<number> {
  const paidBefore = now.getTime() - RECONCILE_GRACE_MS;
  const rows = await db
    .selectDistinct({ id: payment.id })
    .from(sponsorship)
    .innerJoin(paymentItem, eq(paymentItem.sponsorshipId, sponsorship.id))
    .innerJoin(payment, eq(payment.id, paymentItem.paymentId))
    .where(
      and(
        eq(sponsorship.status, "rendering"),
        eq(payment.status, "paid"),
        sql`coalesce(${payment.paidAt}, ${payment.updatedAt}) < ${paidBefore}`,
        sql`NOT EXISTS (SELECT 1 FROM ${renderJob} AS ${sql.raw("rj")} WHERE ${ref("rj", renderJob.sponsorshipId)} = ${ref("sponsorship", sponsorship.id)} AND ${inList(ref("rj", renderJob.status), ["queued", "running"])})`
      )
    )
    .limit(RECONCILE_MAX_PAYMENTS);
  if (rows.length === 0) {
    return 0;
  }
  if (!events) {
    console.error(
      `[sponsorships] No EVENTS_QUEUE: ${rows.length} paid payment(s) wait for their render job`
    );
    return 0;
  }
  let resent = 0;
  for (const row of rows) {
    // biome-ignore lint/performance/noAwaitInLoops: one message per payment, bounded.
    const sent = await enqueueEvent(events, {
      paymentId: row.id,
      type: "payment.settled",
    });
    if (sent) {
      resent += 1;
    }
  }
  console.warn(
    `[sponsorships] Re-sent payment.settled for ${resent} paid payment(s) with an item rendering and no render job`
  );
  return resent;
}

// ── Retention (J-04) ───────────────────────────────────────────────────

export type RetentionPurgeResult = Record<RetentionTable, number> & {
  /** Logo objects deleted from R2 (orphans, and the released ones). */
  logosDeleted: number;
  /** Sponsorships whose `logo_key` was cleared (terminal for 30 days). */
  logosReleased: number;
};

/**
 * The daily purge the privacy text promises (ruling 9, J-04), and nothing
 * else:
 * - `audit_log` older than 3 × 365 days; expired `session` and
 *   `verification` rows; `sponsorship_token` used or expired more than 30
 *   days ago (`runRetentionPurges`, `@smog/db`, chunked);
 * - the logos of sponsorships that ended (`rejected`, `cancelled`,
 *   `expired`) more than 30 days ago, when no other sponsorship still
 *   needs them: `logo_key` cleared (`payment_item.includes_logo` keeps the
 *   fact);
 * - R2 `logos/*` objects no sponsorship references, uploaded more than
 *   24 h ago (an upload whose checkout never happened, a replaced logo,
 *   and the ones released above).
 * With `dryRun`, it counts and deletes nothing. A failing part is logged
 * and the others still run; the first error is rethrown at the end.
 */
export async function runRetentionPurge({
  db,
  dryRun = false,
  media,
  now,
}: {
  db: Db;
  dryRun?: boolean;
  media: LogoBucket | undefined;
  now: Date;
}): Promise<RetentionPurgeResult> {
  let failure: unknown;
  let tables: Record<RetentionTable, number> = {
    audit_log: 0,
    session: 0,
    sponsorship_token: 0,
    verification: 0,
  };
  try {
    tables = await runRetentionPurges(db, now, { dryRun });
  } catch (error) {
    failure = error;
  }
  let logosReleased = 0;
  let logosDeleted = 0;
  try {
    logosReleased = await releaseTerminalLogos(db, now, { dryRun });
    if (media) {
      logosDeleted = await orphanLogoSweep(db, media, now, { dryRun });
    } else {
      console.warn(
        "[sponsorships] No MEDIA binding: the logo sweep is skipped"
      );
    }
  } catch (error) {
    console.error("[sponsorships] Failed to sweep the logos:", error);
    failure ??= error;
  }
  if (failure !== undefined) {
    throw failure;
  }
  return { ...tables, logosDeleted, logosReleased };
}
