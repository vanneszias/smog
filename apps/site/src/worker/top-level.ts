import { logUnhandledError } from "@smog/utils";

/**
 * The top-level handlers for `queue` and `scheduled`, the counterpart of
 * `respondSecurely` for `fetch` (phase 9 task 8, ruling 14): an exception
 * that escapes is logged once as `[error] <entry> {id, name, message}` (the
 * name and a redacted message, never the stack's data) and **rethrown**, so
 * the queue retries the batch (and, past its attempts, dead-letters it) and
 * the cron run shows as failed in the dashboard. The consumers keep their
 * own `[service] Failed to ...` lines; this one is the backstop for what
 * they did not catch.
 */

export async function guardedQueue(
  run: () => Promise<void>,
  queue: string,
  log?: (line: string) => void
): Promise<void> {
  try {
    await run();
  } catch (error) {
    logUnhandledError("queue", error, `${queue}:${crypto.randomUUID()}`, log);
    throw error;
  }
}

export async function guardedScheduled(
  run: () => Promise<void>,
  cron: string,
  log?: (line: string) => void
): Promise<void> {
  try {
    await run();
  } catch (error) {
    logUnhandledError(
      "scheduled",
      error,
      `${cron}:${crypto.randomUUID()}`,
      log
    );
    throw error;
  }
}
