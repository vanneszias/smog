import type { Payload } from "payload";
import { jobsConfig } from "@/jobs";

/**
 * Frees a job that a killed run left claimed and never finished.
 *
 * ## The failure this recovers from
 *
 * `payload.jobs.run` claims up to `JOBS_PER_RUN` rows in one write — every row
 * `processing: true` before the first one is run
 * (`queues/operations/runJobs/index.js`) — and `endpoints/jobs.ts` runs them
 * `sequential: true`. A Worker killed while job 1 is running (its CPU budget,
 * a deploy, an uncaught throw outside every `try`) leaves jobs 2..10 claimed
 * and untouched. Nothing in Payload ever resets `processing: true`: the
 * runner's own candidate query requires `processing: false`
 * (`runJobs/index.js`), so a stranded row is invisible to it for ever.
 *
 * That silence is the actual danger. `countRunnableOrActiveJobsForQueue`
 * counts a job as still active when it has no `completedAt` and no `error` —
 * which a stranded `processing: true` row satisfies — and
 * `defaultBeforeSchedule` refuses to queue a new scheduled task while one is
 * active (`operations/handleSchedules/countRunnableOrActiveJobsForQueue.js`).
 * So one killed run does not just lose the job it was holding: it permanently
 * stops every schedule whose next occurrence would reuse that task, while
 * `GET /api/jobs/run` keeps answering `200 {"status":"ok"}` every hour,
 * because *this* tick has nothing stranded of its own.
 *
 * ## Why thirty minutes
 *
 * `updateJob` stamps `updatedAt` on every write a live run makes
 * (`queues/utilities/updateJob.js`), so a row a run is genuinely still working
 * on has a recent `updatedAt`. A scheduled Worker invocation has a fifteen
 * minute wall-clock ceiling and the cron tick runs inside one
 * (`worker.ts` -> `onScheduled` -> `ctx.waitUntil`), so no live run can still
 * own a row whose `updatedAt` is older than that ceiling. `STRANDED_AFTER_MS`
 * is twice it: long enough that a live run within its own budget is never
 * mistaken for a corpse, short enough that a kill costs at most one extra
 * lease's worth of downtime before this sweep finds it.
 *
 * ## Release, or file as failed — and why `totalTried` is what decides
 *
 * A kill writes no task log entry, so the ordinary retry accounting in
 * `handleTaskError` never sees it and a released job's retry budget is not
 * spent by the crash that stranded it. The job-level `totalTried` field is
 * the one counter Payload bumps on every *ordinary* failure
 * (`errors/handleTaskError.js`) and otherwise leaves alone, so it is what this
 * sweep uses to bound how many times a row may be reaped rather than actually
 * run: a job that has already been reaped up to its task's `retries.attempts`
 * is filed as failed instead of released a further time, on the working
 * assumption that whatever keeps killing the run that holds it is the job's
 * own doing. Filing it sets `error`, which is what takes it out of
 * `countRunnableOrActiveJobsForQueue` and lets the next `handleSchedules`
 * queue a fresh attempt at the *task*, even though this one row is done.
 *
 * ## The consequence this does not engineer away
 *
 * A released `send-email` row whose message was already handed to the email
 * binding before the run was killed will be sent a second time when it runs
 * again. There is no way to tell "the binding call happened and then the
 * Worker died" apart from "the binding call never started" from outside that
 * call, and `email/adapter.ts` gives that same call no timeout for the same
 * reason. At-least-once is the shipped behaviour elsewhere in this codebase —
 * `apps/server/src/services/emailQueue.ts` recovers a stalled BullMQ job the
 * same way — and it is preferable to a renewal reminder nobody was asked
 * about because a lease was never released.
 */

/** Twice a scheduled invocation's wall-clock ceiling; see the comment above. */
const STRANDED_AFTER_MS = 30 * 60 * 1000;

/** The most rows one tick reaps. A backlog larger than this is not lost —
 * the rows left over are exactly as stranded on the next tick as they were
 * on this one, and get taken then — but one tick's own work stays bounded
 * rather than growing with however large a backlog has been left to build
 * up. */
const REAP_LIMIT = 50;

/**
 * Recorded on a row this sweep files as failed, and logged when one or more
 * rows were touched. Never the input, the recipient or any other job data —
 * `jobs/sendEmail.ts` explains why at length: Payload logs the *whole job* on
 * an ordinary failure, and this string is written to exactly that place.
 */
const STRANDED_MESSAGE =
  "[jobs] Stranded: the run that claimed this job ended without finishing it";

/**
 * How many times a task may strand a job before this sweep gives up on it,
 * derived from `jobsConfig` rather than duplicated. A task with no retry
 * configuration, or a row whose `taskSlug` names no task at all — deleted from
 * `jobsConfig` since it was queued — counts as zero: nothing decided it should
 * be tried again, so nothing here decides to either.
 */
function attemptsFor(taskSlug: unknown): number {
  const task = jobsConfig.tasks?.find(
    (candidate) => candidate.slug === taskSlug
  );
  const retries = task?.retries;

  if (typeof retries === "number") {
    return retries;
  }

  return retries?.attempts ?? 0;
}

/**
 * Finds every `payload-jobs` row still `processing: true` from before
 * `cutoff`, and either releases it to run again or files it as failed —
 * never both, and never a third thing.
 *
 * `now` is a parameter rather than read inside, the convention
 * `expireSponsorships(payload, now)` set: a test asserts a decision instead of
 * racing a clock.
 */
export async function reapStrandedJobs(
  payload: Payload,
  now: Date
): Promise<{ failed: number; released: number }> {
  const cutoff = new Date(now.getTime() - STRANDED_AFTER_MS).toISOString();

  const { docs } = await payload.find({
    collection: "payload-jobs",
    depth: 0,
    limit: REAP_LIMIT,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { processing: { equals: true } },
        { updatedAt: { less_than: cutoff } },
      ],
    },
  });

  let released = 0;
  let failed = 0;

  for (const job of docs) {
    const tried = job.totalTried ?? 0;

    if (tried >= attemptsFor(job.taskSlug)) {
      await payload.update({
        collection: "payload-jobs",
        data: {
          error: { message: STRANDED_MESSAGE },
          hasError: true,
          processing: false,
        },
        id: job.id,
        overrideAccess: true,
      });
      failed += 1;
    } else {
      await payload.update({
        collection: "payload-jobs",
        data: { processing: false, totalTried: tried + 1 },
        id: job.id,
        overrideAccess: true,
      });
      released += 1;
    }
  }

  return { failed, released };
}
