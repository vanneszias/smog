/**
 * The seam a Cloudflare Cron Trigger has to be wired into, and an honest
 * account of why it is a seam rather than the wiring.
 *
 * ## The plan is wrong twice about how a cron reaches this application
 *
 * The plan's architecture note says "a Cloudflare Cron Trigger calling
 * `GET /api/payload-jobs/run`". Task 2 found the second half of that wrong —
 * that endpoint is Payload's own, it did not exist until a task was
 * registered, and it is now closed to everybody — and flagged the first half
 * for this task. It is wrong too, and in a way that a `"crons"` entry in
 * `wrangler.jsonc` would hide rather than reveal:
 *
 * **A Cron Trigger does not call a URL.** It invokes the Worker's
 * `scheduled(controller, env, ctx)` handler. Nothing in `wrangler.jsonc` can
 * point a cron at a path, and a Worker whose entry module exports no
 * `scheduled` gets an invocation error on every firing — while the dashboard
 * shows a cron that is configured and an operator has every reason to believe
 * the jobs are running.
 *
 * ## Why the wiring is not done here
 *
 * The Worker's entry module is `.open-next/worker.js`, and this application
 * does not write it. `@opennextjs/cloudflare` copies it verbatim from
 * `cli/templates/worker.js` on every build
 * (`build/utils/copy-package-cli-files.js`), it exports `fetch` and three
 * Durable Object classes and nothing else, and there is no configuration hook
 * that adds an export to it. Reaching a `scheduled()` handler therefore means
 * changing `main` to a wrapper module of this application's own that
 * re-exports the generated worker's `fetch` and its Durable Objects and adds
 * `scheduled` beside them — which is a build-entry change whose only proof is
 * a deployed Worker, cannot be typechecked in a tree where `.open-next` does
 * not exist, and would make `check-types` depend on whether somebody has run
 * a build.
 *
 * **Task 7 owns first contact either way**, so what is here is the part that
 * can be proven without one: what that handler has to do, with everything it
 * depends on passed in.
 *
 * `dispatch` is the generated worker's own `fetch`. Calling it directly rather
 * than going out over the network is deliberate and is the reason this takes a
 * function rather than doing the fetch itself: `wrangler.jsonc` sets
 * `global_fetch_strictly_public`, so a Worker fetching its own public hostname
 * leaves Cloudflare and comes back through the edge — which costs a request,
 * needs the site to be publicly resolvable from inside the runtime, and fails
 * in exactly the environments where a scheduled invocation has no browser to
 * report to.
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
 * `JOBS_RUN_TOKEN` — a secret is deliberately absent from that file (Global
 * Constraints) — and without this intersection `CloudflareEnv` alone shares
 * no property name with this type, which TypeScript's weak-type check
 * (`TS2559`) rejects outright rather than structurally allowing. This is the
 * one case the `lib/mollie.ts` / `jobs/expireSponsorships.ts` ruling against
 * exporting a parameter-shape type doesn't cover: those types have a caller
 * in the same module tree that can just accept the function's inferred
 * parameter; this one is intersected into a *different* type one file over.
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
 * The response is returned rather than inspected, because there is nothing to
 * inspect. `endpoints/jobs.ts` answers every caller the same bytes on purpose —
 * a missing token, a wrong token, an empty queue, a run that did work and a run
 * that threw all produce `200 {"status":"ok"}`, so that the endpoint cannot be
 * used as an oracle for its own secret. What happened goes to the log, where
 * only an operator reads it. A caller that branched on this response would be
 * branching on a constant.
 */
export async function runScheduledTick(
  environment: CronEnvironment,
  dispatch: (request: Request) => Promise<Response>
): Promise<Response> {
  const origin = required(environment.SITE_ORIGIN, "SITE_ORIGIN");
  const token = required(environment.JOBS_RUN_TOKEN, "JOBS_RUN_TOKEN");

  return await dispatch(
    new Request(`${origin}${RUN_PATH}`, {
      headers: { authorization: `Bearer ${token}` },
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
 * The response is inspected here, once, for the one thing `runScheduledTick`
 * deliberately does not tell its caller: whether the run was answered at all.
 * A non-2xx (the endpoint is otherwise silent about outcomes, per its own
 * doc comment) is logged with its status so a failing tick is visible in the
 * Worker log instead of looking identical to a healthy one forever.
 *
 * Both branches only log. A scheduled invocation has no caller to reject to,
 * and Cloudflare docs are explicit that scheduled handlers should not throw:
 * doing so from inside `waitUntil` would surface as an uncaught rejection
 * with no one to catch it, not a retry.
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
        }
      },
      (error: unknown) => {
        console.error("[cron] Scheduled job run failed:", error);
      }
    )
  );
}
