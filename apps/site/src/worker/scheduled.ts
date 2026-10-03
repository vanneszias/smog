import { type CronName, cronName } from "@smog/jobs";

/**
 * One cron's work. A stub per schedule until phase 6 task 5 wires the
 * sweeps (`runExpirySweep`, `runReminderSweep`, `runStaleSweep`,
 * `runRetentionPurge`), each logging `[cron] <name> …` with its counts.
 */
type CronHandler = (env: Env, now: Date) => Promise<void>;

function pending(name: CronName): CronHandler {
  return () => {
    console.log(`[cron] ${name} skipped (its handler is phase 6 task 5)`);
    return Promise.resolve();
  };
}

const HANDLERS: Record<CronName, CronHandler> = {
  expiry: pending("expiry"),
  reminders: pending("reminders"),
  retention: pending("retention"),
  stale: pending("stale"),
};

/**
 * The Worker's `scheduled()` handler: `controller.cron` against `CRON`
 * (`@smog/jobs`). An unknown schedule is logged and ignored. A handler
 * that fails is logged and rethrown, so the run shows as failed in the
 * dashboard; every handler is idempotent and the next run continues.
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
    await HANDLERS[name](env, new Date(controller.scheduledTime));
  } catch (error) {
    console.error(`[cron] Failed to run ${name}:`, error);
    throw error;
  }
}
