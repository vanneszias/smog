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
} from "@smog/sponsorships/server";
import { createMux } from "@smog/video";
import { siteEnv } from "@/server/auth";

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
      now,
      queues: cronQueues(),
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
