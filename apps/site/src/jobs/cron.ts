/**
 * The two testable primitives a Cloudflare Cron Trigger's `scheduled()`
 * handler is built from: the request one tick makes (`runScheduledTick`) and
 * the handler itself, minus the two platform arguments it does not need
 * (`onScheduled`). The handler that actually ships is `worker.ts`, at the
 * package root — it re-exports OpenNext's generated `fetch` and adds
 * `scheduled`, calling `onScheduled` below. That split exists because
 * `worker.ts`'s own import (of OpenNext's build output) only resolves after
 * `opennextjs-cloudflare build` has run, so unlike this file it cannot be
 * unit tested against a tree with no build; proving the *deployed* Worker
 * really ticks happens against a real build and a real deploy (see
 * `docs/deployment-checklist.md`), not a unit test in this file.
 *
 * ## What a Cron Trigger invokes, and why that rules out a "crons" entry alone
 *
 * **A Cron Trigger does not call a URL.** It invokes the Worker's
 * `scheduled(controller, env, ctx)` handler. Nothing in `wrangler.jsonc` can
 * point a cron at a path, and a Worker whose entry module exports no
 * `scheduled` gets an invocation error on every firing — while the dashboard
 * shows a cron that is configured and an operator has every reason to believe
 * the jobs are running. `wrangler.jsonc`'s `main` therefore points at
 * `worker.ts`, not at OpenNext's generated entry module directly.
 *
 * `dispatch` is the generated worker's own `fetch` (see `worker.ts`). Calling
 * it directly rather than going out over the network is deliberate and is
 * the reason `runScheduledTick` takes a function rather than doing the fetch
 * itself: `wrangler.jsonc` sets `global_fetch_strictly_public`, so a Worker
 * fetching its own public hostname leaves Cloudflare and comes back through
 * the edge — which costs a request, needs the site to be publicly resolvable
 * from inside the runtime, and fails in exactly the environments where a
 * scheduled invocation has no browser to report to.
 *
 * ## The two inputs, and why neither may be defaulted
 *
 * `JOBS_RUN_TOKEN` is the shared secret `endpoints/jobs.ts` compares in
 * constant time. `SITE_ORIGIN` is the scheme and host the endpoint's request
 * is made against, and it is not cosmetic: `send-renewal-reminders` builds the
 * renewal link in every message it queues out of `req.origin`, so an origin
 * invented here is a working link to nowhere in a sponsor's inbox.
 *
 * A missing value throws rather than falling back. A scheduled invocation has
 * nobody watching it, so the failure has to be loud in the one place it will
 * be read — the Worker's own logs — instead of becoming a tick that quietly
 * did nothing. The endpoint takes the same position from the other side: a
 * server with no token configured refuses every run rather than treating "no
 * token" as "no authentication required".
 */

/**
 * What a `scheduled()` handler needs out of the Worker environment.
 *
 * Exported for one reason only: `worker.ts` types its `env` as
 * `CloudflareEnv & CronEnvironment`. `wrangler types` builds `CloudflareEnv`
 * from `wrangler.jsonc`'s `vars` and bindings, so it never carries
 * `JOBS_RUN_TOKEN` — a secret is deliberately absent from that file — and
 * without this intersection `CloudflareEnv` alone shares no property name with
 * this type, which TypeScript's weak-type check (`TS2559`) rejects outright
 * rather than structurally allowing. This is the one case the `lib/mollie.ts` /
 * `jobs/expireSponsorships.ts` rule against exporting a parameter-shape type
 * doesn't cover: those types have a caller in the same module tree that can
 * just accept the function's inferred parameter; this one is intersected into a
 * *different* type one file over.
 */
export interface CronEnvironment {
  JOBS_RUN_TOKEN?: string;
  SITE_ORIGIN?: string;
}

/** The path `endpoints/jobs.ts` is mounted at. */
const RUN_PATH = "/api/jobs/run";

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `[cron] ${name} is not set; the scheduled job run was not attempted.`
    );
  }

  return value;
}

/**
 * One tick: the request a Cron Trigger's `scheduled()` handler makes, handed
 * to the Worker that answers it.
 *
 * The response is returned to `onScheduled` rather than inspected here,
 * because on every outcome the *handler* itself produces there is nothing to
 * inspect: `endpoints/jobs.ts` answers every caller the same bytes on
 * purpose — a missing token, a wrong token, an empty queue, a run that did
 * work and a run that threw all produce `200 {"status":"ok"}`, so that the
 * endpoint cannot be used as an oracle for its own secret. What happened
 * goes to the log, where only an operator reads it. For those outcomes a
 * caller branching on this response would be branching on a constant.
 *
 * `onScheduled` still inspects the status, because a non-2xx here is not one
 * of those handler-level outcomes — it is something *beneath* the handler
 * answering instead (a framework crash, an edge failure), which is not a
 * constant and is exactly what Cron Trigger Past Events needs to see.
 *
 * The `host` header is not decoration, and dropping it does not fail loudly —
 * it fails as a wrong link in a sponsor's inbox. `dispatch` is `fetch` from
 * OpenNext's generated worker, not a raw HTTP client: its edge converter
 * rebuilds the request it hands to Next from `x-forwarded-host`, which it
 * reads off the incoming request's own `host` header
 * (`@opennextjs/aws/dist/overrides/converters/edge.js`), Next's server then
 * builds `initURL` from that header — falling back to `localhost` when it is
 * absent — and Payload's `createPayloadRequest` sets `req.origin` from
 * `initURL`. `SITE_ORIGIN` alone only picks the URL this `Request` is
 * constructed with; it says nothing about the `Host` the request carries, and
 * `new Request(url)` does not set one on its own.
 */
export async function runScheduledTick(
  environment: CronEnvironment,
  dispatch: (request: Request) => Promise<Response>
): Promise<Response> {
  const origin = required(environment.SITE_ORIGIN, "SITE_ORIGIN");
  const token = required(environment.JOBS_RUN_TOKEN, "JOBS_RUN_TOKEN");

  return await dispatch(
    new Request(`${origin}${RUN_PATH}`, {
      headers: {
        authorization: `Bearer ${token}`,
        host: new URL(origin).host,
      },
      method: "GET",
    })
  );
}

/**
 * The Worker's `scheduled(controller, env, ctx)` handler, minus the two
 * platform arguments this does not need.
 *
 * `ctx.waitUntil` is the reason this exists rather than the caller just
 * awaiting `runScheduledTick` itself: a Cron Trigger invocation returns as
 * soon as `scheduled()` returns, and anything still in flight past that point
 * is cut off. Handing the promise to `waitUntil` keeps the tick — and the
 * queue drain it triggers — alive after this function has returned.
 *
 * Both branches log, then rethrow. Cloudflare's own Cron Trigger docs say
 * "The first ctx.waitUntil to fail will be observed and recorded as the
 * status in the Cron Trigger Past Events table" — so a `waitUntil` promise
 * that swallows its rejection (what this function used to do) makes every
 * tick show as a success in that table, forever, whether or not anything
 * actually ran. Rethrowing is what lets a bad tick be recorded as failed
 * there, rather than only visible to someone running a live `wrangler tail`
 * at the right minute.
 *
 * The response is inspected here, once, for the one thing `runScheduledTick`
 * deliberately does not tell its caller: whether the run was answered at
 * all. A non-2xx is logged with its status and then thrown as a new
 * `Error`. `endpoints/jobs.ts` answers `200 {"status":"ok"}` for every
 * handler-level outcome on purpose — including a refused token (see
 * `runScheduledTick`'s doc comment) — so this branch does not fire for
 * those; the endpoint's own 200-for-everything design means Past Events
 * catches framework-level failures (a crash below the handler, an edge
 * error), not handler-level refusals, which stay visible only in the log
 * line. A thrown `dispatch` error is logged with the same `[cron]` prefix
 * and rethrown unchanged.
 */
export function onScheduled(
  environment: CronEnvironment,
  context: { waitUntil(promise: Promise<unknown>): void },
  dispatch: (request: Request) => Promise<Response>
): void {
  context.waitUntil(
    runScheduledTick(environment, dispatch).then(
      (response) => {
        if (!response.ok) {
          console.error(`[cron] Scheduled job run answered ${response.status}`);
          throw new Error(
            `[cron] Scheduled job run answered ${response.status}`
          );
        }
      },
      (error: unknown) => {
        console.error("[cron] Scheduled job run failed:", error);
        throw error;
      }
    )
  );
}
