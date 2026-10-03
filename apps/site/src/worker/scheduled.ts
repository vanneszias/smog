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
 * counts. The vars and secrets come validated from `siteEnv()`; the
 * queues and the bucket from the `env` the platform passes.
 */
type CronHandler = (env: Env, now: Date) => Promise<Record<string, number>>;

/**
 * The reminders' outbox: `EMAIL_QUEUE`, and a hand-off that still fails
 * after the producer's retries throws, so the sweep counts it
 * (`emailFailed`) and logs it for an admin (fix round 1, M-1). The state
 * is already committed (ruling 8).
 */
function reminderOutbox(env: Env): QueueEmailOutbox {
  return new QueueEmailOutbox(
    env.EMAIL_QUEUE as unknown as QueueProducer<EmailMessage>,
    { onFailure: "throw" }
  );
}

/** The queues a sweep hands its outputs to (`enqueueOutputs`, task 4). */
function cronQueues(env: Env): JobQueues {
  return { email: env.EMAIL_QUEUE, events: env.EVENTS_QUEUE };
}

const HANDLERS: Record<CronName, CronHandler> = {
  expiry: async (_env, now) => ({
    ...(await runExpirySweep({
      db: createDb(siteEnv().db),
      mux: createMux(siteEnv().worker),
      now,
    })),
  }),
  reminders: async (env, now) => ({
    ...(await runReminderSweep({
      db: createDb(siteEnv().db),
      email: reminderOutbox(env),
      now,
      siteUrl: siteEnv().vars.SITE_URL,
    })),
  }),
  retention: async (env, now) => ({
    ...(await runRetentionPurge({
      db: createDb(siteEnv().db),
      kv: siteEnv().kv,
      media: env.MEDIA,
      now,
    })),
  }),
  stale: async (env, now) => ({
    ...(await runStaleSweep({
      db: createDb(siteEnv().db),
      mollie: createMollie(siteEnv().worker),
      now,
      queues: cronQueues(env),
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
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const name = cronName(controller.cron);
  if (!name) {
    console.warn(`[cron] Unknown schedule ${controller.cron}`);
    return;
  }
  try {
    const counts = await HANDLERS[name](
      env,
      new Date(controller.scheduledTime)
    );
    console.log(`[cron] ${name} ${JSON.stringify(counts)}`);
  } catch (error) {
    console.error(`[cron] Failed to run ${name}:`, error);
    throw error;
  }
}
