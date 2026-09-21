import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
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
    const result = await req.payload.jobs.run({
      limit: JOBS_PER_RUN,
      overrideAccess: true,
      queue: QUEUE,
    });

    req.payload.logger.info(
      `[jobs] Ran ${Object.keys(result.jobStatus ?? {}).length} jobs from the ${QUEUE} queue`
    );
  } catch (error) {
    // A job that throws must not take the lease down with it. Note that "no
    // queue at all" is *not* this branch: `jobs.enabled` is false until a task
    // is registered (Tasks 3 and 5), and measured here, `payload.jobs.run`
    // then answers `noJobsRemaining` rather than throwing — so until those
    // tasks land this endpoint is a scheduler with nothing to schedule, and
    // says so at info level. Either way the caller gets the same bytes; see
    // the note above about why.
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
