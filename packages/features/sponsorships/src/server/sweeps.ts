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
  failWhen,
  gesture,
  inList,
  type PaymentKind,
  payment,
  paymentItem,
  RetentionPurgeError,
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
import type { EmailOutbox } from "@smog/email";
import { enqueueOutputs, type JobQueues } from "@smog/jobs";
import {
  cancelPayment,
  getPayment,
  type MollieClient,
  type MolliePayment,
  mapMollieStatus,
} from "@smog/payments";
import { DAY_MS } from "@smog/utils";
import { deleteAsset, type Mux } from "@smog/video";
import {
  and,
  asc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  type SQL,
  sql,
} from "drizzle-orm";
import { REJECTED_VIDEO_PURGE_PER_RUN } from "../schema/retention";
import { SETTLED_AT_SQL } from "./email-window";
import {
  ENDED_STATUSES,
  type LogoBucket,
  type LogoCursorStore,
  orphanLogoSweep,
  releaseTerminalLogos,
} from "./orphan-logos";
import { rejectedEventAtSql, rejectedVideoCutoff } from "./rejected-video";
import {
  reconcileRenderJobs,
  type WorkflowStatusPort,
} from "./render-watchdog";
import { RENDER_WATCHDOG_CEILING } from "./render-workflow";
import { settlePayment } from "./settle";
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
        not(inList(sponsorship.status, ENDED_STATUSES))
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
        // `reminder_sent_at` is set, so no later run sends it: flag it for
        // an admin, who regenerates the renewal link (ruling 11).
        result.emailFailed += 1;
        console.error(
          `[sponsorships] Failed to queue the renewal reminder for ${row.id}; an admin must regenerate its renewal link:`,
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
  /** Mollie could not be asked; the next hour retries. */
  deferred: number;
  /** Payments whose local batch failed (logged). */
  failed: number;
  /**
   * Payments with a Mollie id left open because Mollie cannot settle them
   * now: no key, Mollie answers 404, or open and not cancelable (fix round
   * 1, I-2; logged). Only a payment without a Mollie id is cancelled
   * without Mollie.
   */
  keptOpen: number;
  /** Render jobs the watchdog failed: their Workflow ended or is gone. */
  renderFailed: number;
  /** Queued render jobs whose `render.requested` the watchdog re-sent. */
  renderRequeued: number;
  /** Running render jobs past the ceiling: terminated and failed. */
  renderTimedOut: number;
  /**
   * Paid payments whose `payment.settled` was re-sent because an item sat
   * in `rendering` without a `queued`/`running` render job (the
   * reconciliation step).
   */
  resent: number;
  /** Payments Mollie reports paid, settled (never cancelled). */
  settled: number;
  /**
   * Paid payments still without a render job after the reconciliation
   * window: no longer re-sent, logged once a day for an admin.
   */
  stuck: number;
}

interface StaleRow {
  id: string;
  kind: PaymentKind;
  mollieId: string | null;
}

/**
 * Cancels our open payment that never reached Mollie (no `mollie_id`: a
 * crash between the checkout batch and Mollie): the payment becomes
 * `canceled`, and for an initial payment every `awaiting_payment` item
 * `cancelled` (`{ reason: "stale" }`), so the gestures are free. A renewal
 * only marks the payment: the sponsorship runs to its end.
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

type StaleStep = "settled" | "cancelled" | "keptOpen" | "deferred";

/**
 * Mollie's view of a payment that has a Mollie id (D-STALE): paid is
 * settled, never cancelled; open and cancelable is cancelled in Mollie and
 * settled as such; an ended payment is settled as it ended. A payment
 * Mollie answers 404 for, or that is open and not cancelable, is kept open
 * (`keptOpen`, logged): money may still arrive for it (fix round 1, I-2).
 */
async function staleAtMollie(
  context: { db: Db; mollie: MollieClient; now: Date; queues: JobQueues },
  row: StaleRow & { mollieId: string },
  result: StaleSweepResult
): Promise<StaleStep> {
  const { db, mollie, now } = context;
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
  if (!fetched) {
    console.error(
      `[sponsorships] Mollie does not know ${row.mollieId} of the stale payment ${row.id} (a key of another profile?); it is left open`
    );
    return "keptOpen";
  }
  if (mapMollieStatus(fetched.status) === "open") {
    console.warn(
      `[sponsorships] The stale payment ${row.id} is ${fetched.status} at Mollie and cannot be cancelled; it is left open`
    );
    return "keptOpen";
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
  await enqueueOutputs(context.queues, outcome);
  return mapMollieStatus(fetched.status) === "paid" ? "settled" : "cancelled";
}

/** One stale payment: Mollie's view when it has a Mollie id, else a local cancel. */
async function staleStep(
  context: {
    db: Db;
    mollie: MollieClient | null;
    now: Date;
    queues: JobQueues;
  },
  row: StaleRow,
  result: StaleSweepResult
): Promise<StaleStep> {
  const { db, mollie, now } = context;
  if (row.mollieId === null) {
    await cancelLocally(db, row, now);
    return "cancelled";
  }
  if (!mollie) {
    console.warn(
      `[sponsorships] No MOLLIE_API_KEY: the stale payment ${row.id} has a Mollie id and is left open`
    );
    return "keptOpen";
  }
  return await staleAtMollie(
    { ...context, mollie },
    { ...row, mollieId: row.mollieId },
    result
  );
}

/**
 * Every `open` payment created more than 24 h ago (J-03, D-STALE, amended
 * by fix round 1, I-2): one with a Mollie id is re-fetched first, then
 * settled (paid), or cancelled in Mollie when it is cancelable and settled
 * as cancelled, or kept open (no key, a 404, not cancelable). One without
 * a Mollie id never reached Mollie and is cancelled locally. A Mollie
 * error leaves the payment open for the next hour. Then the
 * reconciliation re-sends lost fan-outs, and the render watchdog
 * (`reconcileRenderJobs`, phase 7 ruling 12) re-sends lost
 * `render.requested` and fails jobs whose Workflow died (`workflow` is
 * `null` without a `RENDER_WORKFLOW` binding: only the re-send applies).
 */
export async function runStaleSweep({
  db,
  mollie,
  mux,
  now,
  queues,
  siteUrl,
  workflow,
}: {
  db: Db;
  mollie: MollieClient | null;
  /** The render watchdog releases a failed job's Mux upload (fix wave I-1). */
  mux: Mux | null;
  now: Date;
  queues: JobQueues;
  siteUrl: string;
  workflow: WorkflowStatusPort | null;
}): Promise<StaleSweepResult> {
  const result: StaleSweepResult = {
    cancelled: 0,
    cancelledAtMollie: 0,
    deferred: 0,
    failed: 0,
    keptOpen: 0,
    renderFailed: 0,
    renderRequeued: 0,
    renderTimedOut: 0,
    resent: 0,
    settled: 0,
    stuck: 0,
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
        const step = await staleStep({ db, mollie, now, queues }, row, result);
        result[step] += 1;
        return step === "cancelled" || step === "settled" ? "done" : "skip";
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
  const reconciled = await resendSettled(db, queues, now);
  result.resent = reconciled.resent;
  result.stuck = reconciled.stuck;
  const renders = await reconcileRenderJobs({
    ceilingMs: RENDER_WATCHDOG_CEILING,
    db,
    mux,
    now,
    queues,
    siteUrl,
    workflow,
  });
  result.renderFailed = renders.failed;
  result.renderRequeued = renders.requeued;
  result.renderTimedOut = renders.timedOut;
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
 * A payment is re-sent hourly for this long after it was paid (at most
 * 168 attempts); after that it is `stuck`: not re-sent, logged daily.
 */
export const RECONCILE_WINDOW_MS = 7 * DAY_MS;
/** The UTC hour of the daily `stuck` log line. */
const STUCK_LOG_HOUR = 0;

/** A paid payment with an item in `rendering` and no active render job. */
function waitingForRender(): SQL {
  return and(
    eq(sponsorship.status, "rendering"),
    eq(payment.status, "paid"),
    sql`NOT EXISTS (SELECT 1 FROM ${renderJob} AS ${sql.raw("rj")} WHERE ${ref("rj", renderJob.sponsorshipId)} = ${ref("sponsorship", sponsorship.id)} AND ${inList(ref("rj", renderJob.status), ["queued", "running"])})`
  ) as SQL;
}

/** When the payment was first applied (fix wave, jobs I-1; see `email-window.ts`). */
const PAID_AT = SETTLED_AT_SQL;

/**
 * The reconciliation step of the hourly sweep (task 4 review): every paid
 * payment with an item in `rendering` and no `queued`/`running` render
 * job, applied by us (its first settling event, else `paid_at`; fix
 * wave, jobs I-1) between 7 days and 5 minutes ago, gets `payment.settled`
 * again, oldest first, at most `RECONCILE_MAX_PAYMENTS` per run, so a
 * fan-out lost after the commit (a crash, a queue outage past the
 * retries, a dead-lettered message) is resumed. Idempotent: the consumer
 * creates at most one job per item in D1 and keys its emails. Older ones
 * are `stuck`: counted, and logged once a day (fix round 1, M-2).
 */
async function resendSettled(
  db: Db,
  queues: JobQueues,
  now: Date
): Promise<{ resent: number; stuck: number }> {
  const windowStart = now.getTime() - RECONCILE_WINDOW_MS;
  const rows = await db
    .select({ id: payment.id, paidAt: sql<number>`min(${PAID_AT})` })
    .from(sponsorship)
    .innerJoin(paymentItem, eq(paymentItem.sponsorshipId, sponsorship.id))
    .innerJoin(payment, eq(payment.id, paymentItem.paymentId))
    .where(
      and(
        waitingForRender(),
        sql`${PAID_AT} < ${now.getTime() - RECONCILE_GRACE_MS}`,
        sql`${PAID_AT} >= ${windowStart}`
      )
    )
    .groupBy(payment.id)
    .orderBy(asc(sql`min(${PAID_AT})`), asc(payment.id))
    .limit(RECONCILE_MAX_PAYMENTS);
  let resent = 0;
  for (const row of rows) {
    // biome-ignore lint/performance/noAwaitInLoops: one message per payment, bounded, oldest first.
    const sent = await enqueueOutputs(queues, {
      events: [{ paymentId: row.id, type: "payment.settled" }],
      notify: [],
    });
    if (sent) {
      resent += 1;
    }
  }
  if (resent > 0) {
    console.warn(
      `[sponsorships] Re-sent payment.settled for ${resent} paid payment(s) with an item rendering and no render job`
    );
  }
  const [stuckRow] = await db
    .select({ n: sql<number>`count(DISTINCT ${payment.id})` })
    .from(sponsorship)
    .innerJoin(paymentItem, eq(paymentItem.sponsorshipId, sponsorship.id))
    .innerJoin(payment, eq(payment.id, paymentItem.paymentId))
    .where(and(waitingForRender(), sql`${PAID_AT} < ${windowStart}`));
  const stuck = stuckRow?.n ?? 0;
  if (stuck > 0 && now.getUTCHours() === STUCK_LOG_HOUR) {
    console.error(
      `[sponsorships] ${stuck} paid payment(s) have had an item rendering without a render job for more than 7 days; no longer re-sent, check the events DLQ and the render input`
    );
  }
  return { resent, stuck };
}

// ── Retention (J-04) ───────────────────────────────────────────────────

export type RetentionPurgeResult = Record<RetentionTable, number> & {
  /** Logo objects deleted from R2 (orphans, and the released ones). */
  logosDeleted: number;
  /** Sponsorships whose `logo_key` was cleared (see `releaseTerminalLogos`). */
  logosReleased: number;
  /** Rejected videos whose Mux asset was deleted and ids cleared (ruling 13). */
  rejectedVideosDeleted: number;
  /** Rejected videos Mux failed to delete: kept, retried the next night. */
  rejectedVideosFailed: number;
  /** Rejected videos past the bound still left after this run. */
  rejectedVideosRemaining: number;
};

/** A rejected video's ids are cleared only while the row still holds it. */
const REJECTED_VIDEO_GUARD = "sponsorship-rejected-video";

/**
 * The rejected sponsorships whose video the purge deletes: `rejected`,
 * with a video asset, and a `rejected` **event** at or before `cutoff`.
 * A migrated row without one is never selected (controller ruling). An
 * index seek on `sponsorship_status_ends_at_idx` (`status = 'rejected'`),
 * the event a seek per row on `sponsorship_event_sponsorship_created_idx`
 * (a query-plan test).
 */
function rejectedVideoWhere(cutoff: number): SQL {
  return and(
    eq(sponsorship.status, "rejected"),
    isNotNull(sponsorship.videoAssetId),
    sql`${rejectedEventAtSql(ref("sponsorship", sponsorship.id))} <= ${cutoff}`
  ) as SQL;
}

/**
 * A page of the purge, oldest rejection first, without the rows this run
 * already failed on (`skip`), at most `limit` (`REJECTED_VIDEO_PURGE_PER_RUN`)
 * rows. The order sorts the eligible rows only (a temporary B-tree, after
 * the index seek), which stay few: at most the rejections of a night's
 * backlog.
 */
export function rejectedVideoQuery(
  db: Db,
  now: Date,
  skip: readonly string[] = [],
  limit: number = REJECTED_VIDEO_PURGE_PER_RUN
) {
  return db
    .select({
      gestureAssetId: gesture.muxAssetId,
      id: sponsorship.id,
      videoAssetId: sponsorship.videoAssetId,
    })
    .from(sponsorship)
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .where(
      and(
        rejectedVideoWhere(rejectedVideoCutoff(now)),
        not(inList(sponsorship.id, skip))
      )
    )
    .orderBy(
      asc(rejectedEventAtSql(ref("sponsorship", sponsorship.id))),
      asc(sponsorship.id)
    )
    .limit(limit);
}

async function countRejectedVideos(db: Db, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sponsorship)
    .where(rejectedVideoWhere(rejectedVideoCutoff(now)));
  return row?.n ?? 0;
}

/**
 * Clears a purged video's ids in one guarded batch, while the row is still
 * `rejected` with that asset. `updated_at` is kept: the logo release
 * counts its 30 days from it, and nothing about the sponsorship changed.
 */
async function clearRejectedVideo(
  db: Db,
  row: { id: string; videoAssetId: string }
): Promise<void> {
  await run(db, [
    failWhen(
      db,
      REJECTED_VIDEO_GUARD,
      sql`NOT EXISTS (SELECT 1 FROM ${sponsorship} WHERE ${sponsorship.id} = ${row.id} AND ${sponsorship.status} = 'rejected' AND ${sponsorship.videoAssetId} = ${row.videoAssetId})`
    ),
    db
      .update(sponsorship)
      .set({
        updatedAt: sql`${sponsorship.updatedAt}`,
        videoAssetId: null,
        videoPlaybackId: null,
      })
      .where(
        and(
          eq(sponsorship.id, row.id),
          eq(sponsorship.videoAssetId, row.videoAssetId)
        )
      ),
  ]);
}

type RejectedVideoCounts = Pick<
  RetentionPurgeResult,
  "rejectedVideosDeleted" | "rejectedVideosFailed" | "rejectedVideosRemaining"
>;

/**
 * The rejected video's retention (phase 8 ruling 13): for each rejected
 * sponsorship whose `rejected` event is `REJECTED_VIDEO_RETENTION_DAYS`
 * old or more, oldest first, at most `REJECTED_VIDEO_PURGE_PER_RUN` per run, the Mux
 * asset is deleted (`deleteAsset`; 404 counts as done), then
 * `video_asset_id` and `video_playback_id` are cleared in a guarded batch.
 * An asset a gesture or a running sponsorship still uses is not deleted,
 * only unlinked. A Mux failure leaves the row as it is, so the next night
 * retries it; this run looks past it (at most twice
 * `REJECTED_VIDEO_PURGE_PER_RUN` rows tried per run). Without a Mux client nothing is deleted. Logs
 * `[retention] rejected videos { deleted, failed, remaining }`.
 */
async function purgeRejectedVideos(
  db: Db,
  mux: Mux | null,
  now: Date,
  dryRun: boolean
): Promise<RejectedVideoCounts> {
  const counts: RejectedVideoCounts = {
    rejectedVideosDeleted: 0,
    rejectedVideosFailed: 0,
    rejectedVideosRemaining: 0,
  };
  if (dryRun) {
    const eligible = await countRejectedVideos(db, now);
    counts.rejectedVideosDeleted = Math.min(
      eligible,
      REJECTED_VIDEO_PURGE_PER_RUN
    );
    counts.rejectedVideosRemaining = eligible - counts.rejectedVideosDeleted;
    return counts;
  }
  if (!mux) {
    counts.rejectedVideosRemaining = await countRejectedVideos(db, now);
    if (counts.rejectedVideosRemaining > 0) {
      console.warn(
        "[sponsorships] The Mux credentials are not set: the rejected videos are kept"
      );
    }
    return counts;
  }
  // Pages, oldest rejection first; a row that fails is skipped for the
  // rest of the run (review M1), so persistent failures cannot stall the
  // others. At most PER_RUN deleted, and 2 × PER_RUN Mux calls, per run.
  const skip: string[] = [];
  for (;;) {
    const room = Math.min(
      REJECTED_VIDEO_PURGE_PER_RUN - counts.rejectedVideosDeleted,
      2 * REJECTED_VIDEO_PURGE_PER_RUN -
        counts.rejectedVideosDeleted -
        counts.rejectedVideosFailed
    );
    if (room <= 0) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: each page reads what the last one left.
    const rows = await rejectedVideoQuery(db, now, skip, room);
    for (const row of rows) {
      // biome-ignore lint/performance/noAwaitInLoops: one asset at a time, bounded per run.
      if (await purgeRejectedVideo(db, mux, row)) {
        counts.rejectedVideosDeleted += 1;
      } else {
        counts.rejectedVideosFailed += 1;
        skip.push(row.id);
      }
    }
    if (rows.length < room) {
      break;
    }
  }
  counts.rejectedVideosRemaining = await countRejectedVideos(db, now);
  return counts;
}

/** One rejected video: `false` (logged) when Mux or the batch failed. */
async function purgeRejectedVideo(
  db: Db,
  mux: Mux,
  row: {
    gestureAssetId: string | null;
    id: string;
    videoAssetId: string | null;
  }
): Promise<boolean> {
  const assetId = row.videoAssetId as string;
  try {
    const used =
      assetId === row.gestureAssetId || (await assetInUse(db, assetId, row.id));
    if (!used) {
      await deleteAsset(mux, assetId);
    }
    await clearRejectedVideo(db, { id: row.id, videoAssetId: assetId });
    return true;
  } catch (error) {
    console.error(
      `[sponsorships] Failed to delete the rejected video ${assetId} of sponsorship ${row.id}; the next run retries:`,
      error
    );
    return false;
  }
}

/**
 * The daily purge the privacy text promises (ruling 9, J-04, amended by
 * fix round 1), and nothing else:
 * - `audit_log` older than 3 × 365 days; expired `session` and
 *   `verification` rows; `sponsorship_token` used or expired more than 29
 *   days ago (`runRetentionPurges`, `@smog/db`, chunked);
 * - the logo key of sponsorships that ended more than 30 days ago and can
 *   no longer use a logo that was paid for (`releaseTerminalLogos`):
 *   `logo_key` cleared (`payment_item.includes_logo` keeps the fact);
 * - R2 `logos/*` objects no sponsorship references, uploaded more than
 *   24 h ago (an upload whose checkout never happened, a replaced logo,
 *   and the ones released above), resuming a KV cursor across runs;
 * - the Mux video of a sponsorship rejected `REJECTED_VIDEO_RETENTION_DAYS`
 *   or more ago by its `rejected` event, at most 20 per run
 *   (`purgeRejectedVideos`, phase 8 ruling 13; `mux` is `null` without
 *   the Mux credentials, and then nothing is deleted).
 * With `dryRun`, it counts what a real run would delete (the released
 * logos included) and changes nothing, the cursor included. A failing
 * part is logged and the others still run; then what was done is logged
 * (`[sponsorships] The retention purge failed part way; done: {…}`, the
 * D1 counts from `RetentionPurgeError`) and the first error is rethrown
 * (Phase 6 fix wave, jobs M-6).
 */
export async function runRetentionPurge({
  db,
  dryRun = false,
  kv,
  media,
  mux,
  now,
}: {
  db: Db;
  dryRun?: boolean;
  kv: LogoCursorStore | undefined;
  media: LogoBucket | undefined;
  mux: Mux | null;
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
    if (error instanceof RetentionPurgeError) {
      tables = error.counts;
    }
  }
  let logosReleased = 0;
  let logosDeleted = 0;
  try {
    const released = await releaseTerminalLogos(db, now, { dryRun });
    logosReleased = released.count;
    if (media) {
      logosDeleted = await orphanLogoSweep(db, media, now, {
        dryRun,
        kv,
        released: released.keys,
      });
    } else {
      console.warn(
        "[sponsorships] No MEDIA binding: the logo sweep is skipped"
      );
    }
  } catch (error) {
    console.error("[sponsorships] Failed to sweep the logos:", error);
    failure ??= error;
  }
  let videos: RejectedVideoCounts = {
    rejectedVideosDeleted: 0,
    rejectedVideosFailed: 0,
    rejectedVideosRemaining: 0,
  };
  try {
    videos = await purgeRejectedVideos(db, mux, now, dryRun);
    console.log(
      `[retention] rejected videos ${JSON.stringify({
        deleted: videos.rejectedVideosDeleted,
        failed: videos.rejectedVideosFailed,
        remaining: videos.rejectedVideosRemaining,
        ...(dryRun ? { dryRun } : {}),
      })}`
    );
  } catch (error) {
    console.error("[sponsorships] Failed to purge the rejected videos:", error);
    failure ??= error;
  }
  const counts = { ...tables, logosDeleted, logosReleased, ...videos };
  if (failure !== undefined) {
    console.error(
      `[sponsorships] The retention purge failed part way; done: ${JSON.stringify(counts)}`
    );
    throw failure;
  }
  return counts;
}
