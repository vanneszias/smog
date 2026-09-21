import type { JobsConfig, RunJobAccess } from "payload";
import { JobCancelledError } from "payload";
import { isRetryableSendFailure } from "@/email/adapter";
import { type SendEmailInput, sendQueuedEmail } from "@/jobs/sendEmail";
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
 * through the Local API from `endpoints/account.ts` and
 * `hooks/queueReEditEmail.ts`, and the `payload-jobs` collection itself
 * refuses `create`, `read`, `update` and `delete` to everybody
 * (`queues/config/collection.js`), so there is no request that reaches them.
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

/** The task slug the two queue points name. */
export const SEND_EMAIL = "send-email";

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
          options: ["email-change", "re-edit"],
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
      slug: SEND_EMAIL,
    },
  ],
};
