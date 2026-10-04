/**
 * The render watchdog (phase 7 ruling 12, carry 9.1): the hourly stale
 * sweep reconciles render jobs whose `render.requested` was lost or whose
 * Workflow instance died, so no job stays `queued`/`running` for ever and
 * every failure ends in `failRender` (`render_failed` and the keyed admin
 * emails, from which the admin retries, A-27).
 *
 * | Job | Instance | Action |
 * |---|---|---|
 * | `queued` > 10 min | not found, or no binding | re-enqueue `render.requested` |
 * | `queued`, created > 6 h ago | not found, no binding, `unknown`, or its status keeps throwing | `terminate()` (best effort), then `failRender` (`workflowNeverStarted`) |
 * | `queued` > 10 min | `complete`/`errored`/`terminated` | `failRender` |
 * | `running` | `errored`/`terminated` | `failRender` with the instance's error |
 * | `running` | `complete` (the commit was lost) | `failRender` |
 * | `running` | not found | `failRender` |
 * | `running` past the ceiling | still active | `terminate()`, then `failRender` |
 * | `running`, created longer ago than the ceiling | `unknown`, or its status keeps throwing | `terminate()` (best effort), then `failRender` |
 * | `running` past the ceiling | no binding (the pipeline was turned off) | `failRender` (`workflowUnavailable`) |
 * | `queued` past the ceiling | still active | `terminate()`, then `failRender` |
 * | any | active, before the ceiling | untouched |
 * | any | `unknown`, or its status throws, within its bound | logged, untouched |
 *
 * Every `failRender` here also releases the job's Mux upload (cancelled,
 * its asset deleted unless it is the gesture's or the sponsorship's:
 * `releaseRenderUpload`, phase 7 fix wave I-1), as the Workflow's `fail`
 * does.
 *
 * The `queued` ceiling row is an addition to ruling 12 (task 7 review
 * M-5): an instance that never leaves `queued`/`paused` would otherwise
 * keep its job `queued` for ever. Both ceilings are measured from the
 * job's `updated_at` (`RENDER_WATCHDOG_CEILING`, derived from the
 * Workflow's step configs; `queued → running` sets it, and nothing else in
 * the Workflow moves it). The "never started" rows (fix wave I-2) are
 * measured from the job's `created_at`, which nothing moves: a re-enqueue
 * moves the job's `updated_at` to now, so the next run waits another 10
 * minutes before sending it again, but it never resets that bound.
 * Without a Workflow binding (`RENDER_MODE=fake`, or the pipeline turned
 * off with jobs in flight) the requeue, the never-started and the
 * `workflowUnavailable` rows apply. Idempotent: it acts on
 * `queued`/`running` jobs only.
 */
import { type RenderJobStatus, renderJob } from "@smog/db";
import type { Db } from "@smog/db/client";
import { enqueueOutputs, type JobQueues } from "@smog/jobs";
import type { Mux } from "@smog/video";
import { and, asc, eq, lt } from "drizzle-orm";
import { failRender, readRenderJob } from "./render";
import {
  RENDER_WATCHDOG_CEILING,
  RenderJobFailure,
  releaseRenderUpload,
  summariseRenderError,
} from "./render-workflow";

/** A `queued` job this old has lost its `render.requested` (or its start). */
export const RENDER_QUEUED_GRACE_MS = 10 * 60_000;
/**
 * A `queued` job created this long ago whose Workflow is still not found
 * (or unknown, or unreadable) never started: every re-send failed (a
 * Workflow registration that failed, an instance quota, a refused
 * `create`). It fails with `workflowNeverStarted`, so the admin is
 * emailed and can retry (fix wave I-2). Measured from `created_at`.
 */
export const RENDER_NEVER_STARTED_MS = 6 * 60 * 60_000;
/**
 * Jobs looked at per run and per status (`queued`, `running`), oldest
 * first, so neither kind can starve the other (task 7 review M-7); the
 * next hour continues.
 */
export const RENDER_WATCHDOG_BUDGET = 25;
/**
 * A Workflow instance's status: the runtime's `WorkflowInstanceStatus`
 * (`InstanceStatus["status"]`).
 */
export type WorkflowInstanceStatus =
  | "complete"
  | "errored"
  | "paused"
  | "queued"
  | "rollingBack"
  | "running"
  | "terminated"
  | "unknown"
  | "waiting"
  | "waitingForPause";

/** What `instance.status()` answers: the runtime's `InstanceStatus`, narrowed. */
export interface WorkflowInstanceState {
  error?: { message: string; name?: string } | null;
  status: WorkflowInstanceStatus;
}

/**
 * The Workflow binding as the watchdog sees it (the site adapts
 * `RENDER_WORKFLOW`): an instance's status, `"not-found"` when the engine
 * does not know the id, and `terminate`.
 */
export interface WorkflowStatusPort {
  status: (instanceId: string) => Promise<WorkflowInstanceState | "not-found">;
  terminate: (instanceId: string) => Promise<void>;
}

export interface RenderWatchdogResult {
  /** Jobs failed (`failRender`) because their instance ended or is gone. */
  failed: number;
  /** `queued` jobs whose `render.requested` was sent again. */
  requeued: number;
  /** Jobs past the ceiling with an active instance: terminated, then failed. */
  timedOut: number;
}

/**
 * Still working. `rollingBack` (the runtime's rollback handlers, which the
 * render never registers) counts as active too.
 */
const ACTIVE_INSTANCE: ReadonlySet<WorkflowInstanceStatus> = new Set([
  "paused",
  "queued",
  "rollingBack",
  "running",
  "waiting",
  "waitingForPause",
]);

const ENDED_INSTANCE: ReadonlySet<WorkflowInstanceStatus> = new Set([
  "complete",
  "errored",
  "terminated",
]);

/**
 * The error stored for a job whose instance ended: the instance's own
 * error, summarised as the Workflow's own failures are
 * (`summariseRenderError`: no URL, so signed Mux URLs never reach D1, a log
 * or an email).
 */
export function instanceErrorSummary(instance: WorkflowInstanceState): string {
  return instance.error
    ? `workflow ${instance.status}: ${summariseRenderError(instance.error)}`
    : `workflow ${instance.status}`;
}

interface WatchedJob {
  createdAt: Date;
  id: string;
  status: RenderJobStatus;
  updatedAt: Date;
  workflowInstanceId: string;
}

/**
 * The seek of one status on `render_job_status_updated_idx` (migration
 * 0011): `status = ? [AND updated_at < ?]`, oldest first.
 */
export function watchdogQuery(
  db: Db,
  status: "queued" | "running",
  before: Date | null
) {
  return db
    .select({
      createdAt: renderJob.createdAt,
      id: renderJob.id,
      status: renderJob.status,
      updatedAt: renderJob.updatedAt,
      workflowInstanceId: renderJob.workflowInstanceId,
    })
    .from(renderJob)
    .where(
      before
        ? and(eq(renderJob.status, status), lt(renderJob.updatedAt, before))
        : eq(renderJob.status, status)
    )
    .orderBy(asc(renderJob.updatedAt))
    .limit(RENDER_WATCHDOG_BUDGET);
}

interface WatchdogContext {
  ceilingMs: number;
  db: Db;
  /** Releases a failed job's upload; `null` without the Mux token. */
  mux: Mux | null;
  now: Date;
  queues: JobQueues;
  result: RenderWatchdogResult;
  siteUrl: string;
  workflow: WorkflowStatusPort | null;
}

/**
 * Claims a `queued` job for a re-send (its `updated_at` becomes now, only
 * if nobody touched it since the read), then enqueues `render.requested`.
 * The starter treats an instance that already exists as started.
 */
async function requeue(context: WatchdogContext, job: WatchedJob) {
  const claimed = await context.db
    .update(renderJob)
    .set({ updatedAt: context.now })
    .where(
      and(
        eq(renderJob.id, job.id),
        eq(renderJob.status, "queued"),
        eq(renderJob.updatedAt, job.updatedAt)
      )
    )
    .returning({ id: renderJob.id });
  if (claimed.length === 0) {
    return;
  }
  const sent = await enqueueOutputs(context.queues, {
    events: [{ renderJobId: job.id, type: "render.requested" }],
    notify: [],
  });
  if (sent) {
    context.result.requeued += 1;
    console.warn(
      `[sponsorships] Re-sent render.requested for the queued render job ${job.id}`
    );
  }
}

/**
 * `failRender`, its keyed admin emails and the job's Mux upload released
 * (`releaseRenderUpload`: the same cleanup as the Workflow's `fail`, fix
 * wave I-1); `true` when the job failed here.
 */
async function fail(
  context: WatchdogContext,
  job: WatchedJob,
  error: string
): Promise<boolean> {
  const outcome = await failRender(context.db, {
    error,
    now: context.now,
    renderJobId: job.id,
    siteUrl: context.siteUrl,
  });
  if (outcome.outcome !== "failed") {
    return false;
  }
  await enqueueOutputs(context.queues, { events: [], notify: outcome.notify });
  console.warn(
    `[sponsorships] The render watchdog failed render job ${job.id}: ${error}`
  );
  const record = await readRenderJob(context.db, job.id);
  if (record) {
    await releaseRenderUpload(context.mux, record);
  }
  return true;
}

/** A failure's text as the Workflow stores it (`code: detail`). */
function failureText(
  code: "workflowNeverStarted" | "workflowUnavailable",
  detail: string
): string {
  return summariseRenderError(new RenderJobFailure(code, detail));
}

function ageOf(context: WatchdogContext, since: Date): number {
  return context.now.getTime() - since.getTime();
}

/**
 * An instance the watchdog cannot see (`unknown`, a status that keeps
 * throwing) or that never existed, past the job's bound: a best-effort
 * `terminate()` first (a late start cannot then commit after the
 * failure; an error is logged, the failure goes ahead), then `failRender`.
 */
async function failUnseen(
  context: WatchdogContext,
  job: WatchedJob,
  error: string,
  terminate: boolean
): Promise<void> {
  if (terminate && context.workflow) {
    try {
      await context.workflow.terminate(job.workflowInstanceId);
    } catch (failure) {
      console.error(
        `[sponsorships] Failed to terminate the Workflow of render job ${job.id}; failing it anyway:`,
        failure
      );
    }
  }
  if (await fail(context, job, error)) {
    context.result.failed += 1;
  }
}

/** The bound of a job whose instance is not seen, from its `created_at`. */
function pastUnseenBound(context: WatchdogContext, job: WatchedJob): boolean {
  const bound =
    job.status === "queued" ? RENDER_NEVER_STARTED_MS : context.ceilingMs;
  return ageOf(context, job.createdAt) > bound;
}

/** The failure of a job whose instance is not seen past its bound. */
function unseenError(job: WatchedJob, why: string): string {
  return job.status === "queued"
    ? failureText(
        "workflowNeverStarted",
        `the Workflow did not start within 6 hours (${why})`
      )
    : `timed out (${why})`;
}

/**
 * An active instance past the ceiling: terminated first, so a late commit
 * cannot land after the failure, then `failRender("timed out")`. When the
 * terminate succeeds and the failure does not, the next run sees a
 * `terminated` instance and fails the job through that row instead
 * ("workflow terminated", counted as `failed`).
 */
async function timeOutIfPastCeiling(
  context: WatchdogContext,
  job: WatchedJob,
  instance: WorkflowInstanceState,
  workflow: WorkflowStatusPort
): Promise<void> {
  const age = ageOf(context, job.updatedAt);
  if (!ACTIVE_INSTANCE.has(instance.status) || age <= context.ceilingMs) {
    return;
  }
  await workflow.terminate(job.workflowInstanceId);
  if (await fail(context, job, "timed out")) {
    context.result.timedOut += 1;
  }
}

async function reconcileQueued(
  context: WatchdogContext,
  job: WatchedJob,
  instance: WorkflowInstanceState | "not-found" | null,
  workflow: WorkflowStatusPort | null
): Promise<void> {
  if (instance === null || instance === "not-found" || workflow === null) {
    if (pastUnseenBound(context, job)) {
      await failUnseen(
        context,
        job,
        unseenError(
          job,
          workflow === null ? "no Workflow binding" : "instance not found"
        ),
        false
      );
      return;
    }
    await requeue(context, job);
    return;
  }
  if (ENDED_INSTANCE.has(instance.status)) {
    if (await fail(context, job, "workflow ended without a result")) {
      context.result.failed += 1;
    }
    return;
  }
  await timeOutIfPastCeiling(context, job, instance, workflow);
}

async function reconcileRunning(
  context: WatchdogContext,
  job: WatchedJob,
  instance: WorkflowInstanceState | "not-found",
  workflow: WorkflowStatusPort
): Promise<void> {
  if (instance === "not-found") {
    if (await fail(context, job, "workflow not found")) {
      context.result.failed += 1;
    }
    return;
  }
  if (instance.status === "complete") {
    // The instance finished, but its commit never reached the job.
    if (await fail(context, job, "workflow completed without a result")) {
      context.result.failed += 1;
    }
    return;
  }
  if (instance.status === "errored" || instance.status === "terminated") {
    if (await fail(context, job, instanceErrorSummary(instance))) {
      context.result.failed += 1;
    }
    return;
  }
  await timeOutIfPastCeiling(context, job, instance, workflow);
}

/**
 * Without a Workflow binding (`fake`, or the pipeline turned off with
 * jobs in flight): a `queued` job is re-sent (the fake starter finishes
 * it), and fails once it is past the never-started bound; a `running` job
 * past the ceiling can no longer be finished by anything, so it fails
 * with `workflowUnavailable` (review M-4).
 */
async function reconcileUnbound(
  context: WatchdogContext,
  job: WatchedJob
): Promise<void> {
  if (job.status === "queued") {
    await reconcileQueued(context, job, null, null);
    return;
  }
  if (ageOf(context, job.updatedAt) <= context.ceilingMs) {
    return;
  }
  const error = failureText(
    "workflowUnavailable",
    "the render pipeline was turned off while this job ran"
  );
  if (await fail(context, job, error)) {
    context.result.failed += 1;
  }
}

/**
 * The instance's status, `"not-found"`, or `null` when the port throws
 * and the job is within its bound (logged; the next run retries). Past
 * the bound a status that keeps throwing fails the job (fix wave I-2).
 */
async function statusOf(
  context: WatchdogContext,
  job: WatchedJob,
  workflow: WorkflowStatusPort
): Promise<WorkflowInstanceState | "not-found" | null> {
  try {
    return await workflow.status(job.workflowInstanceId);
  } catch (error) {
    if (!pastUnseenBound(context, job)) {
      throw error;
    }
    console.error(
      `[sponsorships] The Workflow status of render job ${job.id} is still unreadable past its bound:`,
      error
    );
    await failUnseen(context, job, unseenError(job, "status unreadable"), true);
    return null;
  }
}

async function reconcileOne(
  context: WatchdogContext,
  job: WatchedJob
): Promise<void> {
  const { workflow } = context;
  if (!workflow) {
    await reconcileUnbound(context, job);
    return;
  }
  const instance = await statusOf(context, job, workflow);
  if (instance === null) {
    return;
  }
  if (instance !== "not-found" && instance.status === "unknown") {
    if (pastUnseenBound(context, job)) {
      await failUnseen(context, job, unseenError(job, "status unknown"), true);
      return;
    }
    console.warn(
      `[sponsorships] The Workflow instance of render job ${job.id} is unknown; left for the next run`
    );
    return;
  }
  if (job.status === "queued") {
    await reconcileQueued(context, job, instance, workflow);
  } else {
    await reconcileRunning(context, job, instance, workflow);
  }
}

/**
 * Reconciles at most `RENDER_WATCHDOG_BUDGET` `queued` jobs older than 10
 * minutes and as many `running` ones, each kind oldest first, as the
 * table at the top of this file says. A job that fails to reconcile is
 * logged and skipped; the next hour retries.
 */
export async function reconcileRenderJobs({
  ceilingMs = RENDER_WATCHDOG_CEILING,
  db,
  mux,
  now,
  queues,
  siteUrl,
  workflow,
}: {
  ceilingMs?: number;
  db: Db;
  mux: Mux | null;
  now: Date;
  queues: JobQueues;
  siteUrl: string;
  workflow: WorkflowStatusPort | null;
}): Promise<RenderWatchdogResult> {
  const result: RenderWatchdogResult = { failed: 0, requeued: 0, timedOut: 0 };
  const queuedBefore = new Date(now.getTime() - RENDER_QUEUED_GRACE_MS);
  // Without a binding only the running jobs past the ceiling are acted on.
  const runningBefore = workflow ? null : new Date(now.getTime() - ceilingMs);
  const [queued, running] = await Promise.all([
    watchdogQuery(db, "queued", queuedBefore),
    watchdogQuery(db, "running", runningBefore),
  ]);
  const jobs = [...queued, ...running];
  const context: WatchdogContext = {
    ceilingMs,
    db,
    mux,
    now,
    queues,
    result,
    siteUrl,
    workflow,
  };
  for (const job of jobs) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one job at a time, oldest first, bounded.
      await reconcileOne(context, job);
    } catch (error) {
      console.error(
        `[sponsorships] Failed to reconcile render job ${job.id}; the next run retries:`,
        error
      );
    }
  }
  return result;
}
