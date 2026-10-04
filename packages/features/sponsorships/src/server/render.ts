/**
 * The render seam (phase 6 ruling 7): the jobs, their start through a
 * `RenderStarter` chosen by `RENDER_MODE` (the site's `worker/render.ts`:
 * `fakeRenderStarter`, or `RENDER_WORKFLOW.create(…)` since phase 7), and
 * their result. The Workflow's steps are `runRenderJob`
 * (`render-workflow.ts`).
 *
 * - `createRenderJobStatements`: a `queued` job (`id` = the Workflow
 *   instance id, `attempt` counted up) and its `render_started` event, for
 *   a sponsorship in `rendering` without a `queued`/`running` job; the
 *   caller enqueues `render.requested` after the batch.
 * - `retryRenderStatements` (A-27, phase 7): the admin's retry of a
 *   `render_failed` sponsorship, `render_failed → rendering`
 *   (`render_retried`) and the next job in one batch.
 * - `markRenderRunning`, `completeRender`, `failRender`: idempotent (a
 *   final job is a no-op).
 * - `readRenderJob`, `setRenderUpload`, `isCurrentRenderUpload`: the
 *   Workflow's and the Mux webhook's reads and the upload id write.
 */
import {
  failWhen,
  gesture,
  inList,
  type RenderJobStatus,
  ref,
  renderJob,
  type Statement,
  sponsorship,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import type { OutboxEmail } from "@smog/email";
import type { EventMessage, RenderStarter } from "@smog/jobs";
import { RENDER_INPUT_VERSION, renderInputSchema } from "@smog/render/contract";
import { newId } from "@smog/utils";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import { RENDER_ERROR_MAX } from "../schema/events";
import { SponsorshipActionError } from "./lifecycle";
import { emailAdmins } from "./recipients";
import {
  eventStatement,
  STALE_GUARD,
  transitionStatements,
} from "./transition";

/** A job that is still queued or running: no second one is created. */
const ACTIVE_JOB_GUARD = "render-active";
/** A job that finished between the read and the batch. */
const FINAL_JOB_GUARD = "render-final";

/** The job statuses that are not final. */
const ACTIVE: readonly RenderJobStatus[] = ["queued", "running"];

/** A `queued`/`running` job of the sponsorship `sponsorshipId` names. */
function activeJobExists(sponsorshipId: SQL | string): SQL {
  return sql`EXISTS (SELECT 1 FROM ${renderJob} AS ${sql.raw("rj")} WHERE ${ref("rj", renderJob.sponsorshipId)} = ${sponsorshipId} AND ${inList(ref("rj", renderJob.status), ACTIVE)})`;
}

export interface RenderJobPlan {
  /** `render.requested` for the new job, to enqueue after the batch. */
  after: EventMessage[];
  /** The new job's attempt (1 for the first job of a sponsorship). */
  attempt: number;
  renderJobId: string;
  statements: Statement[];
}

/**
 * The batch that creates the next render job of a `rendering`
 * sponsorship, or `null` when it is not rendering or already has a
 * `queued`/`running` job. In-batch guards make a race between two
 * creators fail one of them (`createRenderJob` answers `null` then).
 *
 * `resubmitted` (the re-edit, phase 6 task 5): the same batch first moves
 * the sponsorship `changes_requested → rendering` with these values, so
 * the read expects `changes_requested` and the job's input takes the new
 * display name and logo. The in-batch guards still check `rendering` at
 * that point of the batch.
 *
 * `retried` (the admin's retry, A-27): the read expects `render_failed`,
 * and the batch itself starts with `render_failed → rendering`
 * (`render_retried`, by `actorId`), then the guards and the job. A
 * concurrent retry or a status that moved on fails the transition's guard.
 */
export async function createRenderJobStatements(
  db: Db,
  input: {
    now: Date;
    resubmitted?: { displayName: string; logoKey: string | null };
    retried?: { actorId: string };
    sponsorshipId: string;
  }
): Promise<RenderJobPlan | null> {
  const { now, resubmitted, retried, sponsorshipId } = input;
  const [row] = await db
    .select({
      active: sql<number>`${activeJobExists(ref("sponsorship", sponsorship.id))}`,
      displayName: sponsorship.displayName,
      lastAttempt: sql<
        number | null
      >`(SELECT max(${ref("rj", renderJob.attempt)}) FROM ${renderJob} AS ${sql.raw("rj")} WHERE ${ref("rj", renderJob.sponsorshipId)} = ${ref("sponsorship", sponsorship.id)})`,
      logoKey: sponsorship.logoKey,
      playbackId: gesture.playbackId,
      status: sponsorship.status,
    })
    .from(sponsorship)
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .where(eq(sponsorship.id, sponsorshipId))
    .limit(1);
  const expected = expectedStatus(input);
  if (row?.status !== expected || row.active) {
    return null;
  }
  const renderJobId = newId();
  const attempt = (row.lastAttempt ?? 0) + 1;
  const jobInput = renderInputSchema.parse({
    displayName: resubmitted?.displayName ?? row.displayName,
    logoKey: resubmitted ? resubmitted.logoKey : row.logoKey,
    sourcePlaybackId: row.playbackId,
    v: RENDER_INPUT_VERSION,
  });
  return {
    after: [{ renderJobId, type: "render.requested" }],
    attempt,
    renderJobId,
    statements: [
      ...(retried
        ? transitionStatements(db, {
            actorId: retried.actorId,
            data: {},
            event: "render_retried",
            from: "render_failed",
            now,
            sponsorshipId,
          })
        : []),
      failWhen(
        db,
        STALE_GUARD,
        sql`NOT EXISTS (SELECT 1 FROM ${sponsorship} WHERE ${sponsorship.id} = ${sponsorshipId} AND ${sponsorship.status} = 'rendering')`
      ),
      failWhen(db, ACTIVE_JOB_GUARD, activeJobExists(sponsorshipId)),
      db.insert(renderJob).values({
        attempt,
        createdAt: now,
        id: renderJobId,
        input: jobInput,
        sponsorshipId,
        status: "queued",
        updatedAt: now,
        workflowInstanceId: renderJobId,
      }),
      eventStatement(db, {
        actorId: null,
        data: { attempt, renderJobId },
        now,
        sponsorshipId,
        type: "render_started",
      }),
    ],
  };
}

function expectedStatus(input: {
  resubmitted?: unknown;
  retried?: unknown;
}): "changes_requested" | "render_failed" | "rendering" {
  if (input.resubmitted) {
    return "changes_requested";
  }
  return input.retried ? "render_failed" : "rendering";
}

/**
 * The admin's retry of a failed render (A-27): `render_failed → rendering`
 * (`render_retried`), the next job (`attempt + 1`, a new id and Workflow
 * instance) and its `render_started`, as one batch the admin appends its
 * audit entry to. `after` holds `render.requested`, to enqueue once the
 * batch committed. Refuses with `notFound`, or `stale` for any status but
 * `render_failed` (or one with a job still active); a concurrent retry
 * fails the batch's transition guard (`isStaleTransition`).
 */
export async function retryRenderStatements(
  db: Db,
  input: { actorId: string; now: Date; sponsorshipId: string }
): Promise<RenderJobPlan> {
  const plan = await createRenderJobStatements(db, {
    now: input.now,
    retried: { actorId: input.actorId },
    sponsorshipId: input.sponsorshipId,
  });
  if (plan) {
    return plan;
  }
  const [row] = await db
    .select({ status: sponsorship.status })
    .from(sponsorship)
    .where(eq(sponsorship.id, input.sponsorshipId))
    .limit(1);
  if (!row) {
    throw new SponsorshipActionError(
      "notFound",
      `No sponsorship ${input.sponsorshipId}`
    );
  }
  throw new SponsorshipActionError(
    "stale",
    `Cannot retry the render of sponsorship ${input.sponsorshipId} in ${row.status}`
  );
}

/** Whether a batch lost a race these services treat as "already done". */
function lostRace(error: unknown): boolean {
  const guard = toGuardFailure(error)?.guard;
  return (
    guard === STALE_GUARD ||
    guard === ACTIVE_JOB_GUARD ||
    guard === FINAL_JOB_GUARD
  );
}

/**
 * Creates the next render job (one batch), or `null` when there is
 * nothing to create or another caller created it first. Safe to run
 * twice: one job.
 */
export async function createRenderJob(
  db: Db,
  input: { now: Date; sponsorshipId: string }
): Promise<{ after: EventMessage[]; renderJobId: string } | null> {
  const plan = await createRenderJobStatements(db, input);
  if (!plan) {
    return null;
  }
  const [first, ...rest] = plan.statements;
  try {
    if (first) {
      await db.batch([first, ...rest]);
    }
  } catch (error) {
    if (lostRace(error)) {
      return null;
    }
    console.error(
      `[sponsorships] Failed to create a render job for ${input.sponsorshipId}:`,
      error
    );
    throw error;
  }
  return { after: plan.after, renderJobId: plan.renderJobId };
}

/** What `markRenderRunning` found (phase 7 ruling 4, step `start`). */
export type MarkRunningState =
  | "started"
  | "already-running"
  | "final"
  | "missing";

/**
 * `queued → running` (its `updated_at` starts the watchdog's ceiling
 * clock). A job already `running` answers `already-running`: its Workflow
 * instance id is the job id, so only that instance can be running it, and
 * a replayed `start` continues (B-2). A finished job is `final`, an unknown
 * one `missing`.
 */
export async function markRenderRunning(
  db: Db,
  input: { now: Date; renderJobId: string }
): Promise<MarkRunningState> {
  const rows = await db
    .update(renderJob)
    .set({ status: "running", updatedAt: input.now })
    .where(
      and(eq(renderJob.id, input.renderJobId), eq(renderJob.status, "queued"))
    )
    .returning({ id: renderJob.id });
  if (rows.length > 0) {
    return "started";
  }
  const [row] = await db
    .select({ status: renderJob.status })
    .from(renderJob)
    .where(eq(renderJob.id, input.renderJobId))
    .limit(1);
  if (!row) {
    return "missing";
  }
  return row.status === "running" ? "already-running" : "final";
}

/** A render job as the Workflow reads it (`readRenderJob`). */
export interface RenderJobRecord {
  /** The gesture's own Mux asset: never deleted by a render. */
  gestureAssetId: string | null;
  input: unknown;
  muxAssetId: string | null;
  muxUploadId: string | null;
  sponsorshipId: string;
  sponsorshipStatus: typeof sponsorship.$inferSelect.status;
  status: RenderJobStatus;
  /** The sponsorship's video asset: the previous render's, or this one's once committed. */
  videoAssetId: string | null;
}

/** One render job with its sponsorship's and gesture's asset ids, or `null`. */
export async function readRenderJob(
  db: Db,
  renderJobId: string
): Promise<RenderJobRecord | null> {
  const [row] = await db
    .select({
      gestureAssetId: gesture.muxAssetId,
      input: renderJob.input,
      muxAssetId: renderJob.muxAssetId,
      muxUploadId: renderJob.muxUploadId,
      sponsorshipId: renderJob.sponsorshipId,
      sponsorshipStatus: sponsorship.status,
      status: renderJob.status,
      videoAssetId: sponsorship.videoAssetId,
    })
    .from(renderJob)
    .innerJoin(sponsorship, eq(sponsorship.id, renderJob.sponsorshipId))
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .where(eq(renderJob.id, renderJobId))
    .limit(1);
  return row ?? null;
}

/**
 * Stores the job's current Mux upload (step `render`), only while the job
 * is `running` and its upload is still `previousUploadId`, the one the
 * attempt read (a compare-and-set, phase 7 fix wave M-1: an attempt that
 * went on past its timeout cannot overwrite a later attempt's upload).
 * `not-running` when the job left `running` (the watchdog failed it),
 * `superseded` when another attempt stored its upload first. Its
 * `updated_at` is left alone on purpose: the watchdog's ceiling clock runs
 * from `queued → running`, so a retried render does not restart it.
 * Nothing clears `mux_upload_id` afterwards: it stays the committed (or
 * last) upload, which `isCurrentRenderUpload` relies on.
 */
export async function setRenderUpload(
  db: Db,
  input: {
    previousUploadId: string | null;
    renderJobId: string;
    uploadId: string;
  }
): Promise<"not-running" | "set" | "superseded"> {
  const rows = await db
    .update(renderJob)
    // Kept as it is (the column's `$onUpdate` would move it to now).
    .set({
      muxUploadId: input.uploadId,
      updatedAt: sql`${renderJob.updatedAt}`,
    })
    .where(
      and(
        eq(renderJob.id, input.renderJobId),
        eq(renderJob.status, "running"),
        input.previousUploadId === null
          ? isNull(renderJob.muxUploadId)
          : eq(renderJob.muxUploadId, input.previousUploadId)
      )
    )
    .returning({ id: renderJob.id });
  if (rows.length > 0) {
    return "set";
  }
  const job = await readRenderJob(db, input.renderJobId);
  return job?.status === "running" ? "superseded" : "not-running";
}

/** The job statuses whose upload still may be, or was, committed. */
const CURRENT_UPLOAD_STATUSES: readonly RenderJobStatus[] = [
  "queued",
  "running",
  "succeeded",
];

/**
 * The Mux webhook's `isCurrentUpload` (phase 7 ruling 9, as amended by the
 * task 5 review), from one row read: whether a render job's
 * `asset.ready`/`asset.errored` may still be, or already was, committed.
 * True when the job's `mux_upload_id` is `uploadId` and it is `queued`,
 * `running` or `succeeded`, or when `assetId` is the job's `mux_asset_id`
 * or the sponsorship's `video_asset_id` (a committed asset is never
 * deleted).
 *
 * An unknown job answers `false` (phase 8 rulings 4 and 12, review M-3):
 * the webhook asks only about this env's own jobs (`render-job:<env>:`),
 * so a job this env does not know will never be committed, and its asset
 * is deleted. Another env's events never get here.
 */
export async function isCurrentRenderUpload(
  db: Db,
  input: { assetId: string; renderJobId: string; uploadId: string }
): Promise<boolean> {
  const job = await readRenderJob(db, input.renderJobId);
  if (!job) {
    return false;
  }
  return (
    (job.muxUploadId === input.uploadId &&
      CURRENT_UPLOAD_STATUSES.includes(job.status)) ||
    input.assetId === job.muxAssetId ||
    input.assetId === job.videoAssetId
  );
}

interface JobRow {
  displayName: string;
  error: string | null;
  gestureName: string;
  jobStatus: RenderJobStatus;
  sponsorshipId: string;
  status: typeof sponsorship.$inferSelect.status;
}

async function readJob(db: Db, renderJobId: string): Promise<JobRow | null> {
  const [row] = await db
    .select({
      displayName: sponsorship.displayName,
      error: renderJob.error,
      gestureName: gesture.name,
      jobStatus: renderJob.status,
      sponsorshipId: sponsorship.id,
      status: sponsorship.status,
    })
    .from(renderJob)
    .innerJoin(sponsorship, eq(sponsorship.id, renderJob.sponsorshipId))
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .where(eq(renderJob.id, renderJobId))
    .limit(1);
  return row ?? null;
}

function isActive(status: RenderJobStatus): boolean {
  return ACTIVE.includes(status);
}

function finalJobGuard(db: Db, renderJobId: string): Statement {
  return failWhen(
    db,
    FINAL_JOB_GUARD,
    sql`NOT EXISTS (SELECT 1 FROM ${renderJob} WHERE ${renderJob.id} = ${renderJobId} AND ${inList(renderJob.status, ACTIVE)})`
  );
}

async function runFinal(
  db: Db,
  statements: Statement[],
  renderJobId: string
): Promise<boolean> {
  const [first, ...rest] = statements;
  try {
    if (first) {
      await db.batch([first, ...rest]);
    }
    return true;
  } catch (error) {
    if (lostRace(error)) {
      return false;
    }
    console.error(
      `[sponsorships] Failed to finish render job ${renderJobId}:`,
      error
    );
    throw error;
  }
}

/**
 * The render succeeded: the job `succeeded` with the Mux ids, the video on
 * the sponsorship, and `rendering → in_review` (`render_succeeded`). The
 * fake render passes the gesture's own playback id and no asset.
 */
export async function completeRender(
  db: Db,
  input: {
    assetId: string | null;
    now: Date;
    playbackId: string;
    renderJobId: string;
  }
): Promise<{ outcome: "completed" | "noop" }> {
  const { assetId, now, playbackId, renderJobId } = input;
  const job = await readJob(db, renderJobId);
  if (!(job && isActive(job.jobStatus))) {
    return { outcome: "noop" };
  }
  const statements: Statement[] = [
    finalJobGuard(db, renderJobId),
    db
      .update(renderJob)
      .set({
        finishedAt: now,
        muxAssetId: assetId,
        playbackId,
        status: "succeeded",
        updatedAt: now,
      })
      .where(eq(renderJob.id, renderJobId)),
  ];
  const transitions = job.status === "rendering";
  if (transitions) {
    statements.push(
      ...transitionStatements(db, {
        actorId: null,
        data: { renderJobId },
        event: "render_succeeded",
        from: "rendering",
        now,
        patch: { videoAssetId: assetId, videoPlaybackId: playbackId },
        sponsorshipId: job.sponsorshipId,
      })
    );
  } else {
    console.warn(
      `[sponsorships] Render job ${renderJobId} finished, but its sponsorship is ${job.status}; the video is not used`
    );
  }
  const ran = await runFinal(db, statements, renderJobId);
  // Only a job that moved its sponsorship to review is "completed"; one
  // that only closed itself is a no-op for the caller (Minor 6).
  return { outcome: ran && transitions ? "completed" : "noop" };
}

/**
 * The render failed: the job `failed` with the error (at most 300
 * characters), `rendering → render_failed`, and the `admin_render_failed`
 * email for every admin, which the caller enqueues. A re-run on a job that
 * already failed (the caller failed after the commit) re-derives the same
 * keyed emails with the stored error (fix round 1, I-1); a job that
 * succeeded is a no-op.
 */
export async function failRender(
  db: Db,
  input: { error: string; now: Date; renderJobId: string; siteUrl: string }
): Promise<{ notify: OutboxEmail[]; outcome: "failed" | "noop" }> {
  const { now, renderJobId, siteUrl } = input;
  const error = input.error.slice(0, RENDER_ERROR_MAX);
  const job = await readJob(db, renderJobId);
  if (!job || job.jobStatus === "succeeded") {
    return { notify: [], outcome: "noop" };
  }
  if (job.jobStatus === "failed") {
    return await failedOutcome(db, { job, now, renderJobId, siteUrl });
  }
  const statements: Statement[] = [
    finalJobGuard(db, renderJobId),
    db
      .update(renderJob)
      .set({ error, finishedAt: now, status: "failed", updatedAt: now })
      .where(eq(renderJob.id, renderJobId)),
  ];
  if (job.status === "rendering") {
    statements.push(
      ...transitionStatements(db, {
        actorId: null,
        data: { error, renderJobId },
        event: "render_failed",
        from: "rendering",
        now,
        sponsorshipId: job.sponsorshipId,
      })
    );
  }
  await runFinal(db, statements, renderJobId);
  // Whoever finished the job, its outcome is what is stored now.
  const stored = await readJob(db, renderJobId);
  return stored?.jobStatus === "failed"
    ? await failedOutcome(db, { job: stored, now, renderJobId, siteUrl })
    : { notify: [], outcome: "noop" };
}

/** The admin emails of a failed job, keyed per job and admin. */
async function failedOutcome(
  db: Db,
  input: { job: JobRow; now: Date; renderJobId: string; siteUrl: string }
): Promise<{ notify: OutboxEmail[]; outcome: "failed" }> {
  const { job, now, renderJobId, siteUrl } = input;
  const notify = await emailAdmins(db, now, (admin) => ({
    idempotencyKey: `admin_render_failed:${renderJobId}:${admin.id}`,
    locale: admin.locale,
    props: {
      displayName: job.displayName,
      error: job.error ?? "",
      gestureName: job.gestureName,
      url: `${siteUrl}/admin/sponsorships/${job.sponsorshipId}`,
    },
    template: "transactional/admin-render-failed",
    to: admin.email,
  }));
  return { notify, outcome: "failed" };
}

/**
 * `RENDER_MODE=fake` (dev, tests, e2e, and staging until the owner turns
 * the pipeline on): the render "succeeds" at once with the gesture's own
 * video and no asset (spec §8.2; the admin labels it "fake render (no
 * overlay)").
 */
export function fakeRenderStarter(
  db: Db,
  clock: () => Date = () => new Date()
): RenderStarter {
  return {
    start: async ({ input, renderJobId }) => {
      await completeRender(db, {
        assetId: null,
        now: clock(),
        playbackId: input.sourcePlaybackId,
        renderJobId,
      });
    },
  };
}
