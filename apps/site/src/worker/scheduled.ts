import { createDb } from "@smog/db/client";
import {
  type CronName,
  cronName,
  type EmailMessage,
  type JobQueues,
  QueueEmailOutbox,
  type QueueProducer,
} from "@smog/jobs";
import { createMollie } from "@smog/payments";
import {
  runExpirySweep,
  runReminderSweep,
  runRetentionPurge,
  runStaleSweep,
  type WorkflowInstanceState,
  type WorkflowStatusPort,
} from "@smog/sponsorships/server";
import { createMux } from "@smog/video";
import { siteEnv } from "@/server/auth";

/**
 * The part of a Workflow binding the render watchdog uses (`RENDER_WORKFLOW`,
 * added by the build only in `local`/`container` mode, phase 7 ruling 2).
 */
export interface WorkflowStatusBinding {
  get: (id: string) => Promise<{
    status: () => Promise<WorkflowInstanceState>;
    terminate: () => Promise<void>;
  }>;
}

/**
 * What `get(id)` throws for an id the engine does not know: the code
 * `instance.not_found` (Miniflare: `new Error("instance.not_found")`, and
 * `(instance.not_found) Instance does not exist` from the engine). Only
 * that code: any other error ("Workflow not found", "script not found"
 * during a deploy) is thrown, so the watchdog leaves the job for the next
 * run instead of failing a healthy render (task 7 review I-1).
 */
const NOT_FOUND = /\binstance\.not_found\b/;

export function isInstanceNotFound(error: unknown): boolean {
  return error instanceof Error && NOT_FOUND.test(error.message);
}

/**
 * The render watchdog's `WorkflowStatusPort` over `RENDER_WORKFLOW`
 * (phase 7 ruling 12): an instance's status, `"not-found"` when `get`
 * reports an unknown id (any other error is thrown: the job is left for
 * the next run), and `terminate`. `null` without the binding (`fake`
 * mode): the watchdog then only re-sends lost `render.requested`.
 */
export function workflowStatusPort(
  binding: WorkflowStatusBinding | undefined
): WorkflowStatusPort | null {
  if (!binding) {
    return null;
  }
  return {
    status: async (id) => {
      let instance: Awaited<ReturnType<WorkflowStatusBinding["get"]>>;
      try {
        instance = await binding.get(id);
      } catch (failure) {
        if (isInstanceNotFound(failure)) {
          return "not-found";
        }
        throw failure;
      }
      const { error, status } = await instance.status();
      return { error: error ?? null, status };
    },
    terminate: async (id) => {
      await (await binding.get(id)).terminate();
    },
  };
}

/**
 * One cron's work (phase 6 ruling 9): the sweep from
 * `@smog/sponsorships/server` with this Worker's bindings, returning its
 * counts. The vars, secrets, queues and bucket all come validated from
 * `siteEnv()` (fix wave, jobs M-4): a missing queue fails the run before a
 * sweep commits anything (the reminders' state would otherwise be written
 * and every email lost).
 */
type CronHandler = (now: Date) => Promise<Record<string, number>>;

/**
 * The reminders' outbox: `EMAIL_QUEUE`, and a hand-off that still fails
 * after the producer's retries throws, so the sweep counts it
 * (`emailFailed`) and logs it for an admin (fix round 1, M-1). The state
 * is already committed (ruling 8).
 */
function reminderOutbox(): QueueEmailOutbox {
  return new QueueEmailOutbox(
    siteEnv().bindings.EMAIL_QUEUE as unknown as QueueProducer<EmailMessage>,
    { onFailure: "throw" }
  );
}

/** The queues a sweep hands its outputs to (`enqueueOutputs`, task 4). */
function cronQueues(): JobQueues {
  const { bindings } = siteEnv();
  return { email: bindings.EMAIL_QUEUE, events: bindings.EVENTS_QUEUE };
}

const HANDLERS: Record<CronName, CronHandler> = {
  expiry: async (now) => ({
    ...(await runExpirySweep({
      db: createDb(siteEnv().db),
      mux: createMux(siteEnv().worker),
      now,
    })),
  }),
  reminders: async (now) => ({
    ...(await runReminderSweep({
      db: createDb(siteEnv().db),
      email: reminderOutbox(),
      now,
      siteUrl: siteEnv().vars.SITE_URL,
    })),
  }),
  retention: async (now) => ({
    ...(await runRetentionPurge({
      db: createDb(siteEnv().db),
      kv: siteEnv().kv,
      media: siteEnv().bindings.MEDIA,
      now,
    })),
  }),
  stale: async (now) => ({
    ...(await runStaleSweep({
      db: createDb(siteEnv().db),
      mollie: createMollie(siteEnv().worker),
      mux: createMux(siteEnv().worker),
      now,
      queues: cronQueues(),
      siteUrl: siteEnv().vars.SITE_URL,
      workflow: workflowStatusPort(
        siteEnv().bindings.RENDER_WORKFLOW as WorkflowStatusBinding | undefined
      ),
    })),
  }),
};

/**
 * The Worker's `scheduled()` handler: `controller.cron` against `CRON`
 * (`@smog/jobs`), then `[cron] <name> <counts>`. An unknown schedule is
 * logged and ignored. A handler that fails is logged and rethrown, so the
 * run shows as failed in the dashboard; every handler is idempotent and
 * the next run continues.
 */
export async function dispatchScheduled(
  controller: ScheduledController,
  _env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const name = cronName(controller.cron);
  if (!name) {
    console.warn(`[cron] Unknown schedule ${controller.cron}`);
    return;
  }
  try {
    const counts = await HANDLERS[name](new Date(controller.scheduledTime));
    console.log(`[cron] ${name} ${JSON.stringify(counts)}`);
  } catch (error) {
    console.error(`[cron] Failed to run ${name}:`, error);
    throw error;
  }
}
