import type { JobsConfig, RunJobAccess, TaskConfig } from "payload";
import { JobCancelledError } from "payload";
import { isRetryableSendFailure } from "@/email/adapter";
import { cleanupStalePayments } from "@/jobs/cleanupStalePayments";
import {
  expireSponsorships,
  settleComposedVideos,
} from "@/jobs/expireSponsorships";
import {
  SEND_EMAIL,
  type SendEmailInput,
  sendQueuedEmail,
} from "@/jobs/sendEmail";
import { sendRenewalReminders } from "@/jobs/sendRenewalReminders";
import { LOCALES } from "@/lib/locale";

/**
 * Payload's queue, as this application configures it.
 *
 * ## Registering one task is a schema change, and it is also a new endpoint
 *
 * `config.jobs.enabled` is false until a task exists
 * (`payload/dist/config/sanitize.js`), and flipping it does two things that
 * are easy to miss because neither is written here:
 *
 * 1. **Payload adds the `payload-jobs` collection**, which is a new table, a
 *    new log table and a new column on `payload_locked_documents_rels`. Hence
 *    `migrations/20260921_200000_add_payload_jobs.ts`, and hence clearing
 *    `.wrangler/state` before running the suite against this commit — a stale
 *    persisted D1 fails a different set of files on every run
 *    (`apps/site/README.md`).
 * 2. **Payload registers `GET /api/payload-jobs/run`** on that collection
 *    (`queues/endpoints/run.js`), which runs the queue, and gates it on
 *    `jobs.access.run ?? defaultAccess` — and `defaultAccess` is
 *    `({ req: { user } }) => Boolean(user)`. Left alone, registering this
 *    task would have handed **any signed-in account** a URL that runs every
 *    scheduled job on demand: a way to force mail, and a way to run the queue
 *    beside the lease in `endpoints/jobs.ts` rather than behind it.
 *
 * `access.run` is therefore `denyAll`, and that is the whole of the fix: the
 * one door into the queue is `GET /api/jobs/run`, which carries a shared
 * secret, answers every caller the same bytes, and holds a claim so two ticks
 * cannot overlap. It reaches `payload.jobs.run({ overrideAccess: true })`
 * through the Local API, which does not consult this rule at all — so closing
 * the REST door costs the scheduler nothing.
 *
 * `access.queue` and `access.cancel` default the same way, and are left
 * alone deliberately: neither has a REST surface here. Queueing happens
 * through the Local API from `endpoints/account.ts`,
 * `hooks/queueReEditEmail.ts` and `jobs/sendRenewalReminders.ts`, and the
 * `payload-jobs` collection itself refuses `create`, `read`, `update` and
 * `delete` to everybody (`queues/config/collection.js`), so there is no
 * request that reaches them.
 *
 * ## Adding a `schedule` is a second schema change, and it does nothing on
 * its own
 *
 * Two things follow from the `schedule` properties below, and both are easy
 * to get wrong in a way that looks like it works.
 *
 * 1. **Payload adds a `payload-jobs-stats` global**, which is another table.
 *    `sanitize.js` pushes it the moment any task or workflow carries a
 *    `schedule`, because `handleSchedules` keeps each task's
 *    `lastScheduledRun` in it and computes the next occurrence *from* that
 *    value. Hence `migrations/20260921_220000_add_job_schedules.ts`, and hence
 *    clearing `.wrangler/state` before running the suite against this commit.
 *    Without the table every tick throws on `findGlobal`.
 * 2. **`payload.jobs.run` does not look at a `schedule` at all.** The property
 *    is acted on by `payload.jobs.handleSchedules`, which Payload's own
 *    `GET /api/payload-jobs/run` calls before running the queue
 *    (`queues/endpoints/run.js`) and which the Local API's `run` does not
 *    (`queues/localAPI.js`). `endpoints/jobs.ts` uses the Local API — it has
 *    to, because the access rule above closes Payload's endpoint to
 *    everybody — so it calls `handleSchedules` itself. **A `schedule` added
 *    here without that call is four jobs that are never queued and a cron
 *    that appears to work**, which is why `jobs/schedules.int.test.ts`
 *    asserts a scheduled job reaching the queue and then running, rather than
 *    asserting that a task is registered with a cron string.
 *
 * What `handleSchedules` actually does is worth stating, because it is not
 * "run the task now": it queues one job per due schedule with `waitUntil` set
 * to the *next* occurrence, and `defaultBeforeSchedule` refuses to queue a
 * second while one is still runnable. So the steady state is exactly one
 * pending row per scheduled task, and a tick that finds its `waitUntil` has
 * passed is the tick that runs it.
 */

/**
 * Nobody may run the queue over REST.
 *
 * Not a tightening of a default: it closes a door that registering the first
 * task opened to every signed-in account. See the note above.
 *
 * Written out rather than reusing `access/denyAll`, which does not typecheck
 * here — `RunJobAccess` returns a boolean, while a collection's `Access` may
 * also return a `Where`, and the two are not interchangeable. The same
 * asymmetry `access/index.ts` records for `FieldAccess`.
 */
const denyRun: RunJobAccess = () => false;

/**
 * How many times a deferred send is tried again.
 *
 * Three, transcribed from the shipped queue rather than chosen:
 * `apps/server/src/services/emailQueue.ts` adds every message with
 * `{ attempts: 3, backoff: { type: "exponential", delay: 5000 } }`.
 *
 * Payload counts this as *retries*, not as total tries — `handleTaskError`
 * gives up when the task's own `totalTried` has reached `attempts` — so a
 * message that never stops being refused is attempted four times and then
 * filed with its reason. Bounded is the point: a queue that retries for ever
 * is a queue that never drains and a failure nobody is ever shown.
 */
const SEND_EMAIL_ATTEMPTS = 3;

/**
 * The one queue this application has, named in one place.
 *
 * `endpoints/jobs.ts` drains it and every `schedule` below fills it. Payload
 * matches the two by string — `handleSchedules` only considers schedules whose
 * `queue` is the one being run (`operations/handleSchedules/index.js`) — so a
 * typo here is four jobs that are queued into a queue nothing runs, with no
 * error anywhere.
 */
const QUEUE = "default";

/**
 * The three cron expressions, transcribed from the shipped `node-cron` jobs
 * rather than chosen.
 *
 * `apps/server/src/cron.ts` runs expiry daily at 00:00 and the renewal
 * reminder daily at 08:00 — "to arrive in inboxes at a reasonable time", in
 * its own words — and `cleanup-stale-payments` is hourly, from the spec.
 *
 * **They are evaluated in UTC here and were evaluated in Europe/Brussels
 * there.** croner is given no timezone, so it uses the process's, and a
 * Worker's is UTC with no way to set it per cron. So the reminder goes out at
 * 09:00 or 10:00 Brussels time depending on the season rather than at 08:00,
 * which is still "a reasonable time" and is the whole of the difference.
 * Writing 07:00 to compensate would be right for half the year and wrong for
 * the other half.
 */
const HOURLY = "0 * * * *";
const DAILY_MIDNIGHT = "0 0 * * *";
const DAILY_MORNING = "0 8 * * *";

/**
 * A scheduled task's own retry policy: none, deliberately.
 *
 * Every task below this line is a **sweep**: it derives what is left to do
 * from the state of the database on each run, which is the property
 * `jobs/expireSponsorships.ts` calls resumability and the other two inherit.
 * The next tick is therefore already the retry, and it is a better one — it
 * re-reads the world instead of replaying a decision made from a snapshot that
 * is now minutes old.
 *
 * What a failure leaves behind is a `payload-jobs` row with `hasError` and the
 * reason on it, which is the record an operator reads.
 * `countRunnableOrActiveJobsForQueue` excludes a job that carries an `error`,
 * so a failed sweep does not block the next one from being scheduled —
 * checked rather than assumed, because the opposite would mean one bad night
 * silently ending a job for ever.
 *
 * `send-email` is the exception and the only one: it has a recipient, a
 * refusal that may be transient, and nothing that will re-derive it later.
 */
const NO_RETRIES = { attempts: 0 } as const;

/** A task that runs on a schedule, with the one queue filled in. */
function scheduled(cron: string): NonNullable<TaskConfig["schedule"]> {
  return [{ cron, queue: QUEUE }];
}

export const jobsConfig: JobsConfig = {
  access: { run: denyRun },
  tasks: [
    {
      /**
       * Sends one message, and decides whether a refusal is worth trying
       * again.
       *
       * The decision is the whole of Review Focus 4, and it is two lines
       * because `email/adapter.ts` owns the classification:
       *
       * - **a refusal that could answer differently next time** — a quota or
       *   rate limit, an outage, anything unrecognised — is thrown, and
       *   Payload defers the job with a backoff. A reminder that is deferred
       *   arrives a day late; one that is dropped is a renewal nobody was
       *   asked for.
       * - **a refusal that will refuse again** — a rejected, suppressed or
       *   malformed recipient, a sender domain that is not verified — throws
       *   `JobCancelledError`, which Payload records as a cancelled job with
       *   the reason on the row and *does not retry*
       *   (`queues/operations/runJobs/index.js`). A bad address retried for
       *   ever is a queue that never drains and a log nobody reads.
       *
       * The reason is recorded rather than logged, and the difference
       * matters: `job.error.message` carries the code, so an operator reading
       * the failed jobs sees `E_SENDER_NOT_VERIFIED` — the exact thing Stage 7
       * is blocked on — rather than a hundred identical lines in a console.
       * The message is the code and never the body, for the reason
       * `jobs/sendEmail.ts` gives at length.
       */
      handler: async ({ input, req }) => {
        try {
          /*
           * `input` arrives as `any`: `tasks` is `TaskConfig<any>[]`, so
           * Payload's generated `TaskSendEmail` never reaches this handler.
           * The cast is therefore an assertion rather than a check, and the
           * check lives where it can fail — `sendEmail.int.test.ts` assigns a
           * `SendEmailInput` to the generated type, so a field added to the
           * schema below and not to the interface stops the typecheck.
           */
          await sendQueuedEmail(req.payload, input as SendEmailInput);
        } catch (error) {
          if (isRetryableSendFailure(error)) {
            throw error;
          }

          throw new JobCancelledError(
            error instanceof Error
              ? `The message was refused permanently: ${error.message}`
              : "The message was refused permanently."
          );
        }

        return { output: {} };
      },
      inputSchema: [
        {
          name: "kind",
          type: "select",
          options: ["email-change", "re-edit", "renewal-reminder"],
          required: true,
        },
        // Derived from `lib/locale.ts` rather than written out, so a fourth
        // locale cannot become a message this task refuses to queue.
        {
          name: "locale",
          type: "select",
          options: [...LOCALES],
          required: true,
        },
        // The host the link is built on. Captured from the request that
        // queued the message, because a job's own `req` is a Local API
        // request whose origin is `http://localhost`.
        { name: "origin", type: "text", required: true },
        // One of these, depending on `kind`. Neither is required, because
        // requiring both would make every message carry an identifier it has
        // no use for — and the handler refuses a message whose own
        // identifier is missing, which is a guard a schema cannot express.
        { name: "userId", type: "number" },
        { name: "sponsorshipId", type: "number" },
      ],
      label: "Send one transactional email",
      retries: {
        attempts: SEND_EMAIL_ATTEMPTS,
        backoff: { delay: 5000, type: "exponential" },
      },
      /*
       * No `schedule`. This is the one task nothing puts on a clock: it is
       * queued by `endpoints/account.ts`, `hooks/queueReEditEmail.ts` and
       * `jobs/sendRenewalReminders.ts` when there is a specific message for a
       * specific person, and a scheduled `send-email` would be a job with no
       * recipient.
       */
      slug: SEND_EMAIL,
    },
    {
      /**
       * Takes every sponsorship whose term has ended off the page, deletes
       * the Mux assets nothing can point at any more, and then asks Mux
       * whether the composites this application is still holding actually
       * became playable.
       *
       * **Both halves were built and mutation-proven in Stage 6 Task 5**;
       * this is the wiring the plan says it is. They run in this order and in
       * one task rather than two because the order matters and the split does
       * not: `settleComposedVideos` deliberately skips a render whose
       * sponsorship is in a terminal status, on the grounds that its asset is
       * about to be deleted and asking Mux about it is a request for an
       * answer nobody acts on — which is only true if the expiry has already
       * run. Registering them as two tasks would make that guarantee a
       * coincidence of two cron expressions.
       *
       * `now` is the job's own clock. It is a parameter of the operation so a
       * test can assert a decision rather than race one; there is nothing to
       * carry it from here.
       */
      handler: async ({ req }) => {
        await expireSponsorships(req.payload, new Date());
        await settleComposedVideos(req.payload);

        return { output: {} };
      },
      label: "Expire sponsorships and settle their composed videos",
      retries: NO_RETRIES,
      schedule: scheduled(DAILY_MIDNIGHT),
      slug: "expire-sponsorships",
    },
    {
      /**
       * Asks the sponsors whose term ends in about a month whether they would
       * like another one.
       *
       * `req.origin` is the host the renewal link is built on, and it is the
       * reason `endpoints/jobs.ts` hands its own request to
       * `payload.jobs.run` rather than letting Payload synthesise one. A job
       * run under a `createLocalReq` request has an origin of
       * `http://localhost`, which would be a working link to nowhere in every
       * message this job queues.
       */
      handler: async ({ req }) => {
        await sendRenewalReminders(req.payload, new Date(), req.origin ?? "");

        return { output: {} };
      },
      label: "Send renewal reminders",
      retries: NO_RETRIES,
      schedule: scheduled(DAILY_MORNING),
      slug: "send-renewal-reminders",
    },
    {
      /**
       * Cancels a checkout nobody ever paid for, so the gesture it reserved
       * can be sold again.
       *
       * Hourly, from the spec, and the cadence is part of the design rather
       * than a preference: the window is twenty-four hours, so an hourly
       * sweep means an abandoned checkout blocks its gesture for at most
       * twenty-five, and the row-level lease
       * (`jobs/cleanupStalePayments.ts`) is fifteen minutes — shorter than
       * the interval, so one crashed sweep costs no ticks at all.
       */
      handler: async ({ req }) => {
        await cleanupStalePayments(req.payload, new Date());

        return { output: {} };
      },
      label: "Cancel abandoned checkouts",
      retries: NO_RETRIES,
      schedule: scheduled(HOURLY),
      slug: "cleanup-stale-payments",
    },
  ],
};
