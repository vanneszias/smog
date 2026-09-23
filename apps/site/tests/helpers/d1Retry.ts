/**
 * Retrying a write that lost a race for the local D1 file.
 *
 * Kept apart from `seedUser.ts` on purpose: that module imports
 * `payload.config.ts`, which drags in wrangler and esbuild and cannot be
 * loaded under Vitest's jsdom environment. This module imports nothing, so
 * the matcher below — the part that has already been wrong once — has a
 * plain unit test next to it.
 */

const BUSY_ATTEMPTS = 6;
const BUSY_BACKOFF_MS = 400;

/*
 * The shapes a lost race for the local D1 file arrives in.
 *
 * Sometimes SQLite's own `SQLITE_BUSY` reaches JavaScript. Sometimes workerd
 * logs `database is locked: SQLITE_BUSY` to stderr and hands D1 an opaque
 * `internal error`, which miniflare then relays as `Failed to parse body as
 * JSON`. Both were observed in the same five runs of this suite. Matching only
 * the first shape catches about half of them, which is worse than not
 * retrying, because it looks fixed.
 *
 * None of these say anything about the query: a malformed query fails with a
 * message about the query. These are the transport giving up.
 */
const TRANSIENT_D1_FAILURES = [
  /SQLITE_BUSY/i,
  /database is locked/i,
  /D1_ERROR:[\s\S]*internal error/i,
  /Failed to parse body as JSON/i,
];

/** Matches a transient D1 failure anywhere in the cause chain. */
export function isTransientD1Failure(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 10; depth += 1) {
    if (!(current instanceof Error)) {
      return false;
    }

    const { message } = current;
    if (TRANSIENT_D1_FAILURES.some((shape) => shape.test(message))) {
      return true;
    }

    current = current.cause;
  }

  return false;
}

/**
 * Retries a write that lost a race for the local D1 file.
 *
 * These helpers open their own Payload instance against
 * `.wrangler/state/v3`, which the dev server serving the pages under test is
 * already holding. SQLite answers a second writer with `SQLITE_BUSY` rather
 * than queuing, so the seed and the cleanup fail intermittently — and a throw
 * in `beforeAll` fails the file without failing a named test, which Playwright
 * and Vitest both report in a way that reads like success. Backing off and
 * trying again is what a busy timeout does; the alternative is a suite that
 * cannot run while a dev server is up, which is every local run.
 */
export async function withBusyRetry<T>(
  label: string,
  run: () => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= BUSY_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;

      if (!isTransientD1Failure(error)) {
        console.error(`[d1Retry] Failed to ${label}:`, error);
        throw error;
      }

      console.warn(
        `[d1Retry] The local D1 refused to ${label} (attempt ${attempt} of ${BUSY_ATTEMPTS}); retrying.`
      );
      await new Promise((resolve) => {
        setTimeout(resolve, BUSY_BACKOFF_MS * attempt);
      });
    }
  }

  console.error(
    `[d1Retry] Failed to ${label} after ${BUSY_ATTEMPTS} attempts:`,
    lastError
  );
  throw lastError;
}
