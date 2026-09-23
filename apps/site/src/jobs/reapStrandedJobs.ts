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
 * ## Why thirty minutes, and the invariant it rests on
 *
 * Payload does not heartbeat a job while it runs. A row's `updatedAt` is
 * stamped when the run claims it (the claim is one `updateJobs` call over
 * every claimed row, `runJobs/index.js`), and next when that row's *own* job
 * writes — a task finishing or failing, the job completing
 * (`queues/utilities/updateJob.js` stamps each of those). So rows 2..N of a
 * sequential batch keep their claim-time `updatedAt` for as long as the jobs
 * ahead of them take, and a stale `updatedAt` does not by itself mean nobody
 * holds the row.
 *
 * The invariant this module actually relies on is about the run, not the row:
 * **a whole run, from its claim to its last job, ends within thirty minutes.**
 * Given that, a `processing: true` row last written more than thirty minutes
 * ago belongs to a run that has ended — normally or by being killed — and
 * nothing is still working on it.
 *
 * It holds for every scheduled run: the cron tick runs inside a scheduled
 * Worker invocation (`worker.ts` -> `onScheduled` -> `ctx.waitUntil`), whose
 * wall-clock ceiling is fifteen minutes, half of `STRANDED_AFTER_MS`. It does
 * **not** hold for `GET /api/jobs/run` called over HTTP on its own account:
 * an HTTP request has no wall-clock limit on Workers for as long as the
 * client stays connected, so a manual run that is still going after thirty
 * minutes could have rows reaped from under it by the next tick (whose lease
 * is free again after `LEASE_MS`) and run twice. It holds for an HTTP caller
 * that bounds its own time — `docs/deployment-checklist.md` gives every
 * manual `curl` a `--max-time 600`, and a client that disconnects ends the
 * request, which is just an ordinary killed run.
 *
 * What the window costs: with the hourly cron (`wrangler.jsonc`), a killed
 * scheduled run's rows were last written at most fifteen minutes after its
 * tick began, so they are at least forty-five minutes old when the next tick
 * arrives, and that tick always recovers them. The window delays recovery by
 * nothing beyond the hour the cron waits anyway; it would only cost a further
 * tick under a cadence shorter than thirty minutes.
 *
 * ## Release, or file as failed — and why `totalTried` is what decides
 *
 * A kill writes no task log entry, so the ordinary retry accounting in
 * `handleTaskError` never sees it and a released job's retry budget is not
 * spent by the crash that stranded it. The job-level `totalTried` field is
 * what this sweep uses to bound how many times a row may be reaped rather
 * than actually run: a job whose `totalTried` has reached its task's
 * `retries.attempts` is filed as failed instead of released a further time,
 * on the working assumption that whatever keeps killing the run that holds it
 * is the job's own doing. Filing it sets `error`, which is what takes it out
 * of `countRunnableOrActiveJobsForQueue` and lets the next `handleSchedules`
 * queue a fresh attempt at the *task*, even though this one row is done.
 *
 * That budget is **shared with ordinary failures**, not a separate one:
 * Payload bumps the same `totalTried` on every ordinary failure
 * (`errors/handleTaskError.js`), so a `send-email` (three attempts) that has
 * already failed twice can be reaped once more and is filed as failed on the
 * strand after that. Payload also bumps it on success
 * (`operations/runJobs/runJob/index.js:52`), which is harmless here: a job
 * that succeeds is deleted (`deleteJobOnComplete` defaults to `true`), so no
 * successful row is ever left for this sweep to count.
 *
 * ## Why it writes beneath the Local API, one row at a time
 *
 * `payload.update` validates the whole document, and a row whose `taskSlug`
 * names a task since removed from `jobsConfig` fails that validation
 * (`ValidationError: … Task Slug`) — so a Local API write threw on exactly the
 * row most in need of filing, and, the read being newest first, stopped every
 * older stranded row behind it from ever being reaped. Payload's own runner
 * files such a row beneath validation too: `runJobs/index.js` fails a job
 * whose task "is not registered in payload.config.jobs" through
 * `getUpdateJobFunction` -> `utilities/updateJob.js`, which writes with
 * `payload.db.updateJobs` and stamps `updatedAt` itself. This sweep writes
 * with `payload.db.updateOne` — for these scalar fields the same adapter
 * `upsertRow` call — and stamps `updatedAt` explicitly for the same reason.
 * The operation's hooks change nothing here either: `payload-jobs` has one
 * `beforeChange` hook, which pins `processing: false, hasError: true` on a
 * row already *cancelled* — both of which a cancelled row carries anyway —
 * and an `afterRead` that only derives the virtual `taskStatus`
 * (`queues/config/collection.js`).
 *
 * And each row is written in its own `try`: whatever else can make one row's
 * write fail costs that row alone. It stays `processing: true` and stale, is
 * counted as `errored`, and the next tick tries it again.
 *
 * ## The consequence this does not engineer away
 *
 * A released `send-email` row whose message was already handed to the email
 * binding before the run was killed will be sent a second time when it runs
 * again. There is no way to tell "the binding call happened and then the
 * Worker died" apart from "the binding call never started" from outside that
 * call, and `email/adapter.ts` gives that same call no timeout for the same
 * reason. At-least-once is the accepted trade for a mail queue, and it is
 * preferable to a renewal reminder nobody was asked about because a lease was
 * never released.
 */

/** Twice a scheduled invocation's wall-clock ceiling, and the longest a
 * whole run may take for this sweep to be safe; see the comment above. */
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
 * Finds every `payload-jobs` row in `queue` still `processing: true` from
 * before `cutoff`, and either releases it to run again or files it as failed
 * — never both, and never a third thing. A row whose write fails is counted
 * as `errored` and left exactly as it was.
 *
 * `now` is a parameter rather than read inside, the convention
 * `expireSponsorships(payload, now)` set: a test asserts a decision instead of
 * racing a clock. `queue` is the one `endpoints/jobs.ts` drives, so a row
 * another queue's runner claimed is never judged by this one's lease.
 */
export async function reapStrandedJobs(
  payload: Payload,
  now: Date,
  queue: string
): Promise<{ errored: number; failed: number; released: number }> {
  const cutoff = new Date(now.getTime() - STRANDED_AFTER_MS).toISOString();
  const stamped = now.toISOString();

  const { docs } = await payload.find({
    collection: "payload-jobs",
    depth: 0,
    limit: REAP_LIMIT,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { queue: { equals: queue } },
        { processing: { equals: true } },
        { updatedAt: { less_than: cutoff } },
      ],
    },
  });

  let released = 0;
  let failed = 0;
  let errored = 0;

  for (const job of docs) {
    const tried = job.totalTried ?? 0;

    try {
      if (tried >= attemptsFor(job.taskSlug)) {
        await payload.db.updateOne({
          collection: "payload-jobs",
          data: {
            error: { message: STRANDED_MESSAGE },
            hasError: true,
            processing: false,
            updatedAt: stamped,
          },
          id: job.id,
        });
        failed += 1;
      } else {
        await payload.db.updateOne({
          collection: "payload-jobs",
          data: {
            processing: false,
            totalTried: tried + 1,
            updatedAt: stamped,
          },
          id: job.id,
        });
        released += 1;
      }
    } catch (error) {
      // The id only. The job's own fields — its input above all — never reach
      // a log line from here; see `STRANDED_MESSAGE`.
      payload.logger.error(
        { err: error },
        `[jobs] Failed to reap stranded job ${job.id}; it is left as it was for the next tick`
      );
      errored += 1;
    }
  }

  return { errored, failed, released };
}
