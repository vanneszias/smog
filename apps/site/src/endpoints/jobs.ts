import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { reapStrandedJobs } from "@/jobs/reapStrandedJobs";
import { CLAIM_KINDS, releaseClaim, takeClaim } from "@/lib/claims";
import { equalConstantTime } from "@/lib/constantTime";

/**
 * `GET /api/jobs/run` — the only thing that runs Payload's queue on this
 * platform.
 *
 * ## Why an endpoint at all
 *
 * Workers cannot run a long-lived scheduler, so Payload's `autoRun` is
 * unavailable and the documented serverless pattern is a URL something else
 * calls on a schedule. That makes the scheduler an HTTP surface, with the two
 * problems an HTTP surface has.
 *
 * ## Review Focus 2 — a public URL that executes work
 *
 * Unauthenticated, this is a free denial-of-service and a way to make the
 * application send mail on demand. So it carries a shared secret, in
 * `Authorization: Bearer …` rather than a query string, because a query string
 * is written to every access log between here and the caller.
 *
 * Three properties, and all three are guards rather than politeness:
 *
 * - **The comparison is constant time.** `lib/constantTime.ts` says why at
 *   length: a byte-by-byte `===` returns as soon as it finds a difference, so
 *   how long it takes says how many leading characters were right, and against
 *   a URL anybody may call repeatedly that turns guessing the secret into a
 *   per-character search.
 * - **A server with no token configured refuses everything.** The dangerous
 *   reading of "no token" is "no authentication required", which is how an
 *   environment that forgot the secret becomes an open endpoint rather than a
 *   broken one.
 * - **Every answer is the same bytes.** `200 {"status":"ok"}`, for a missing
 *   token, a wrong token, a run that did nothing, a run that did something and
 *   a run that threw. A different answer for a right token is an oracle: it
 *   lets anyone confirm a guess without being able to observe any other
 *   effect. `endpoints/mollie.ts` reaches the same conclusion from the same
 *   argument, and what happened goes to the log where only an operator reads
 *   it.
 *
 * ## Review Focus 1 — two invocations
 *
 * A cron can fire twice, and a slow run can still be going when the next tick
 * arrives. Three of the four jobs this will drive have irreversible effects —
 * mail sent, a sponsorship cancelled, a Mux asset deleted — so "runs twice"
 * is not a performance problem.
 *
 * Nothing about the URL prevents it, and **a conditional update cannot
 * either**: a `where` on an update is a SELECT on this adapter, measured, with
 * two concurrent updates both reporting a changed row. The claim is what
 * serialises them, and it is a **lease**: it carries an expiry, because a
 * runner that dies holding a claim with no expiry ends scheduled work for ever
 * and does it silently. See `lib/claims.ts`.
 *
 * The lease is released in a `finally`, so a run that throws does not hold it
 * to term either — the expiry is the backstop for a worker that never reaches
 * its own `finally`, not the ordinary path.
 */

/** The one queue this endpoint drives, and the claim key that serialises it. */
const QUEUE = "default";

/**
 * How long a lease is good for.
 *
 * Long enough that a genuinely slow run is not overtaken by the next tick, and
 * short enough that a crashed runner costs one or two skipped ticks rather
 * than every future one. Five minutes sits under a Worker's fifteen-minute
 * ceiling for a scheduled invocation and above anything these four jobs have
 * been measured doing.
 */
const LEASE_MS = 5 * 60 * 1000;

/** The most jobs one invocation will take on, so a tick cannot run for ever. */
const JOBS_PER_RUN = 10;

const NO_STORE = { "Cache-Control": "no-store" };
const OK = 200;
const BEARER = "Bearer ";

/**
 * The one body every reachable decision answers with.
 *
 * A fresh object each time: `Response.json` does not copy it, and a shared
 * literal handed to two responses is a mutable object two callers hold.
 */
function acknowledged(): Response {
  return Response.json({ status: "ok" }, { headers: NO_STORE, status: OK });
}

/**
 * Whether the request carries the configured token.
 *
 * `process.env` is read here, per request, and not at module scope — the trap
 * `lib/mollie.ts` records, where a client built at import time from an unset
 * variable killed an entire `next build` from a file that had nothing to do
 * with it.
 */
function authorized(req: PayloadRequest): boolean {
  const expected = process.env.JOBS_RUN_TOKEN ?? "";

  if (expected === "") {
    return false;
  }

  const header = req.headers.get("authorization") ?? "";

  if (!header.startsWith(BEARER)) {
    return false;
  }

  const presented = header.slice(BEARER.length);

  return equalConstantTime(presented, expected);
}

const runJobs: PayloadHandler = async (
  req: PayloadRequest
): Promise<Response> => {
  if (!authorized(req)) {
    req.payload.logger.warn(
      "[jobs] A run was requested without a usable token; nothing was run"
    );

    return acknowledged();
  }

  const claim = { key: QUEUE, kind: CLAIM_KINDS.jobRun } as const;

  if (!(await takeClaim(req.payload, { ...claim, ttlMs: LEASE_MS }))) {
    req.payload.logger.info(
      "[jobs] A run is already in progress; this tick does nothing"
    );

    return acknowledged();
  }

  try {
    /*
     * **Recovering a job a killed run left claimed, before anything else in
     * this lease.**
     *
     * `payload.jobs.run` marks up to `JOBS_PER_RUN` rows `processing: true`
     * in one write, before the first of them has actually run
     * (`queues/operations/runJobs/index.js`), and this tick runs them
     * `sequential: true`. A Worker killed partway through — its own CPU
     * budget, a bad deploy — leaves the rest claimed and untouched, and
     * nothing in Payload ever resets `processing: true` on its own: the
     * runner's candidate query requires `processing: false`. Left alone, a
     * killed run does not cost one tick, it costs every tick forever, and
     * silently — `countRunnableOrActiveJobsForQueue` treats a stranded row
     * as still active, so `handleSchedules` refuses to queue the scheduled
     * task it was holding, ever again, while this endpoint keeps answering
     * `200 {"status":"ok"}` every hour. `jobs/reapStrandedJobs.ts` is the
     * fix; this call is the only place it runs.
     *
     * It is inside the lease, for the reason the lease exists at all: two
     * overlapping ticks must not both decide the same row is stranded and
     * both release it, which is a `where`-on-an-update race this database
     * cannot serialise any other way. And it is *before* `handleSchedules`,
     * not after, so a schedule this reap just freed is queued by this same
     * tick rather than left to wait for the next one — the same ordering
     * argument the comment below makes for running `handleSchedules` before
     * the queue itself.
     *
     * A reaper failure does not stop the queue draining, for the reason the
     * catch two levels down gives about the run itself: the jobs already
     * queued are work somebody is waiting for, and the next tick re-reads
     * `processing` and `updatedAt` from scratch, so nothing here is lost by
     * this one failing.
     */
    try {
      const reaped = await reapStrandedJobs(req.payload, new Date());

      if (reaped.released + reaped.failed > 0) {
        req.payload.logger.warn(
          `[jobs] Recovered stranded jobs: ${reaped.released} released to run again, ${reaped.failed} filed as failed`
        );
      }
    } catch (error) {
      req.payload.logger.error(
        { err: error },
        "[jobs] Could not recover stranded jobs; the queue is still drained and the next tick tries again"
      );
    }

    /*
     * **The schedules, before the queue — and this call is the whole of
     * whether they exist.**
     *
     * A task's `schedule` is acted on by `handleSchedules` and by nothing
     * else. Payload's own `GET /api/payload-jobs/run` calls it
     * (`queues/endpoints/run.js`); the Local API's `run` does not
     * (`queues/localAPI.js`). This endpoint uses the Local API because
     * `jobs.access.run` is `denyAll` and Payload's endpoint is therefore
     * closed to everybody — so without this line the four `schedule`
     * properties in `jobs/index.ts` would be decoration, the queue would
     * never be filled, and a cron calling this URL every hour would answer
     * `200 {"status":"ok"}` for ever while nothing ran.
     *
     * It is inside the lease, with the run, on purpose. `defaultBeforeSchedule`
     * decides whether to queue by counting the runnable scheduled jobs for the
     * task — a read and then a write, which is the shape this whole
     * application has established does not serialise. Two ticks overlapping
     * outside the lease would both count zero and both queue.
     *
     * It is before the run so that a schedule which has just come due is
     * drained by the same tick rather than waiting for the next one, which is
     * the ordering Payload's own endpoint uses and the reason its comment
     * gives for combining the two.
     *
     * A failure to schedule does not stop the queue draining. The jobs already
     * in it are work somebody is waiting for, and the next tick re-evaluates
     * every schedule from `lastScheduledRun` anyway — nothing is lost by this
     * one failing, and quite a lot is lost by a queue that stops.
     */
    try {
      await req.payload.jobs.handleSchedules({ queue: QUEUE, req });
    } catch (error) {
      req.payload.logger.error(
        { err: error },
        "[jobs] Could not evaluate the schedules; the queue is still drained and the next tick tries again"
      );
    }

    const result = await req.payload.jobs.run({
      limit: JOBS_PER_RUN,
      overrideAccess: true,
      queue: QUEUE,
      /*
       * This request, rather than the local one Payload would synthesise.
       * `createLocalReq` gives a job an origin of `http://localhost` (3.89.0),
       * and `send-renewal-reminders` builds the link in every message it
       * queues out of `req.origin` — so a job run under a synthesised request
       * would send working links to a host nobody can reach. The cron calls
       * this endpoint at the site's own public URL, which is exactly the value
       * those links need.
       */
      req,
      /*
       * **One job at a time.** Payload runs a tick's jobs through
       * `Promise.all` unless told otherwise
       * (`queues/operations/runJobs/index.js`), and this database has no
       * transactions — which is the premise every guard in this application
       * rests on. Two jobs writing the same document in one tick therefore
       * race, and it is not theoretical: the first run of Task 3's tests, with
       * two `send-email` jobs in one tick, died on `Failed query: insert into
       * "users_sessions" …` from inside `Promise.all`, because updating a
       * document rewrites its array tables and two rewrites overlapped.
       *
       * Serialising them costs a tick that takes as long as its jobs added up,
       * against a queue measured in a handful of messages. It buys the same
       * property the lease above buys between ticks, inside one: exactly one
       * writer at a time.
       */
      sequential: true,
    });

    req.payload.logger.info(
      `[jobs] Ran ${Object.keys(result.jobStatus ?? {}).length} jobs from the ${QUEUE} queue`
    );
  } catch (error) {
    // A job that throws must not take the lease down with it. Note that an
    // empty queue is *not* this branch: `payload.jobs.run` answers
    // `noJobsRemaining` rather than throwing, which is also what it did before
    // Task 3 registered the first task and there was no queue at all. Either
    // way the caller gets the same bytes; see the note above about why.
    req.payload.logger.error(
      { err: error },
      "[jobs] The run failed; the lease is released so the next tick retries"
    );
  } finally {
    await releaseClaim(req.payload, {
      ...claim,
      consequence:
        "[jobs] Could not release the run lease; the queue will be idle until it expires",
    });
  }

  return acknowledged();
};

export const jobsEndpoints: Endpoint[] = [
  { handler: runJobs, method: "get", path: "/jobs/run" },
];
