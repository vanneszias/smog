import { sql } from "@payloadcms/db-d1-sqlite";
import type { Payload } from "payload";

/**
 * A fixed-window rate limiter, counted in D1.
 *
 * ## Why this exists at all
 *
 * The usual limiter is a counter in a separate store — an atomic increment plus
 * an expiry for the window. **None is available here.** `apps/site` declares no
 * key-value client, none is reachable from a Cloudflare Worker in this repo's
 * infrastructure, and the whole binding inventory of `wrangler.jsonc` is
 * `ASSETS`, `D1`, `R2` and `EMAIL` — no KV, no Durable Object, no Cloudflare
 * Rate Limiting binding, no Analytics Engine. So the store is the application's
 * own database, and the atomic primitive has to be found there.
 *
 * ## Design (b): upsert-and-return, so the count is exact
 *
 * `lib/claims.ts` establishes the three facts this rests on, measured rather
 * than assumed, and this module does not re-derive them: there are no
 * transactions on `sqliteD1Adapter`, a `where` on an `update` is resolved with
 * a separate SELECT and so does not serialise, and **a unique index is the one
 * atomic primitive**, because SQLite evaluates it inside the INSERT.
 *
 * Two designs were available. Count-then-insert — `payload.count` over the
 * window, then `payload.create` — uses only Payload's own primitives but is
 * approximate: every caller that reads the count before any of them writes
 * sees the same number. Upsert-and-return is one statement,
 * `INSERT … ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`,
 * which SQLite evaluates atomically against `rate_limits_key_idx` and which
 * therefore hands every caller a distinct number.
 *
 * It needs raw drizzle, so the first question was whether `payload.db.drizzle`
 * is reachable on this adapter at all rather than only in its types. It is:
 * the D1 adapter carries a live `drizzle` alongside `insert`, `upsert` and the
 * rest, and `drizzle.get` returns the `RETURNING` row.
 *
 * **Measured, 20 parallel calls at a limit of 10** (`rateLimit.int.test.ts`'s
 * "holds under concurrency", which is the gate this design had to pass):
 *
 * | design                                  | allowed of 20 |
 * | --------------------------------------- | ------------- |
 * | (b) upsert-and-return, this module      | **10**        |
 * | (a) count-then-insert                   | 20            |
 * | (b) with the unique index removed        | 0             |
 *
 * Design (a) let every one of the twenty through. That is not a near miss to
 * be documented as an overshoot bound: at a limit of 10 it is no limiter at
 * all for exactly the traffic shape a limiter is for. Hence (b).
 *
 * ## It fails closed, deliberately
 *
 * A limiter whose store is a *separate service* usually swallows every store
 * failure — availability wins, and upstream provider limits remain a
 * secondary safety net — and that is right there: the store being down is no
 * reason for the API to be down.
 *
 * It stops being right when the store is the application's own database. There
 * is no state of the world where this site is serving requests and D1 is
 * unreachable: every page read, every session check and the relay's own
 * consent lookup go through it. So "availability wins" buys nothing here,
 * while failing open would mean that any fault which makes this query throw —
 * including one an attacker can provoke — silently converts a limited public
 * write endpoint into an unlimited one, with nothing in the response to say
 * so. A refusal is therefore the answer when the counter cannot be read, the
 * error is logged, and the caller is told to come back. The cost of being
 * wrong that way is some dropped analytics events, which are not the product.
 */

/** Allowed, or refused with the seconds until the window turns over. */
export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const MS_PER_SECOND = 1000;

/**
 * How long a spent window's row is kept before {@link pruneRateLimits} takes
 * it.
 *
 * An hour, which is longer than any window this application uses and shorter
 * than anything that could reasonably be called retention. The row's `key`
 * carries a client address, so it is personal data: keeping it past the window
 * it governs serves nobody, and the pruning job is part of the feature rather
 * than housekeeping.
 *
 * It has to exceed the longest `windowSeconds` any caller passes, because a
 * sweep that reached a *live* window would hand whoever was in it a fresh
 * budget.
 */
const RETAIN_SECONDS = 60 * 60;

/**
 * How many spent rows one pass of {@link pruneRateLimits} reads.
 *
 * Bounded for the reason the neighbouring sweeps record: an unbounded read
 * has already broken this suite once, at 132 bound parameters against D1's
 * documented cap of 100 (`jobs/cleanupOrphanedMedia.ts`).
 *
 * Oldest first, so a backlog cannot leave the oldest rows behind every newer
 * one.
 */
const PAGE = 200;

/**
 * How many rows go into one `payload.delete`, and why it is not `PAGE`.
 *
 * **The `where` is not what costs the parameters; the deleted rows are.**
 * `payload.delete` resolves the filter, deletes the rows, and then emits
 * `delete from "payload_preferences" where key in (?, …)` carrying **one bind
 * parameter per deleted document**. D1 refuses at 100 — measured, with the
 * exact statement in the failure:
 *
 * ```
 * D1_ERROR: too many SQL variables at offset 372: SQLITE_ERROR
 *   on: delete from "payload_preferences" where key in (?, ? … 150 of them)
 * ```
 *
 * The damage from getting this wrong is quiet in the worst way. The rows *are*
 * deleted before the throw, so retention keeps happening and no data is lost —
 * what breaks is the job: `NO_RETRIES` files every hourly run failed, and the
 * closing log line `jobs/schedules.int.test.ts` asserts stops appearing in
 * production while every test still passes. A public beacon crosses a hundred
 * distinct addresses in an hour trivially, so this is the steady state rather
 * than a spike.
 *
 * Fifty leaves half the cap spare for whatever else a delete of one row emits.
 */
const DELETE_BATCH = 50;

/**
 * The shape of the adapter this module reaches past Payload for.
 *
 * Structural and minimal, rather than importing the D1 adapter's own type:
 * what is needed is one method, and naming only that makes the dependency on
 * an internal obvious instead of burying it in a package-wide type. `payload.db`
 * is typed as the generic `DatabaseAdapter`, which has no `drizzle` — the cast
 * is the point where this module admits it is below Payload's API.
 */
interface CountingAdapter {
  drizzle: {
    get: (
      query: ReturnType<typeof sql>
    ) => Promise<undefined | { count: number }>;
  };
}

/**
 * Adds one to the window's counter and answers what it now holds.
 *
 * One statement, and that is the whole mechanism. The `ON CONFLICT` arm exists
 * only because `rate_limits.key` is UNIQUE — which is not a nicety the
 * collection could drop. Measured, with `unique` removed from the field and
 * `.wrangler/state/vitest` cleared so the index was really gone: SQLite
 * rejects an `ON CONFLICT` target that matches no constraint, this throws, the
 * fail-closed path below takes over and **0 of 20** calls were allowed at a
 * limit of 10. So the failure is loud in both directions — the counter never
 * silently stops counting — and four of the five tests in
 * `rateLimit.int.test.ts` go red rather than one.
 */
async function increment(
  payload: Payload,
  key: string,
  windowStart: number
): Promise<number> {
  const { drizzle } = payload.db as unknown as CountingAdapter;

  const row = await drizzle.get(
    sql`INSERT INTO "rate_limits" ("key", "count", "window_start") VALUES (${key}, 1, ${windowStart}) ON CONFLICT("key") DO UPDATE SET "count" = "count" + 1 RETURNING "count"`
  );

  if (row === undefined) {
    throw new Error(
      "[rateLimit] The counter returned no row; the upsert did not run."
    );
  }

  return Number(row.count);
}

/**
 * Spends one unit of `key`'s budget in `namespace`, and says whether it was
 * there to spend.
 *
 * The window is fixed rather than sliding: `windowStart` is the caller's clock
 * floored to a multiple of `windowSeconds`, so every client in a given window
 * shares a row and the row's key changes on its own when the window turns
 * over. `retryAfterSeconds` is the time left in the current window, which is
 * the earliest moment a refused caller can succeed.
 *
 * `namespace` is part of the stored key for the same reason `claims.kind` is
 * (`lib/claims.ts`): two features must not be able to collide in one keyspace,
 * or one feature's traffic spends another's budget.
 */
export async function takeRateLimit(args: {
  key: string;
  limit: number;
  namespace: string;
  payload: Payload;
  windowSeconds: number;
}): Promise<RateLimitVerdict> {
  const { key, limit, namespace, payload, windowSeconds } = args;

  const now = Math.floor(Date.now() / MS_PER_SECOND);
  const windowStart = now - (now % windowSeconds);
  const retryAfterSeconds = windowStart + windowSeconds - now;

  let count: number;

  try {
    count = await increment(
      payload,
      `${namespace}:${key}:${windowStart}`,
      windowStart
    );
  } catch (error) {
    // Fail closed — see the module note. The counter's store is this
    // application's own database, so there is no "the limiter is down but the
    // site is up" to stay available for.
    payload.logger.error(
      { err: error },
      "[rateLimit] The counter could not be read; refusing rather than waving the request through."
    );

    return { allowed: false, retryAfterSeconds };
  }

  return count <= limit
    ? { allowed: true }
    : { allowed: false, retryAfterSeconds };
}

/**
 * Deletes the counters whose windows are long over.
 *
 * Called by the hourly job in `jobs/index.ts`. Nothing else ever removes these
 * rows: a fixed window's row stops being consulted the moment the window turns
 * over, so without this the table grows by one row per client per window for
 * ever — and every one of them holds an address.
 *
 * `now` is a parameter so a test can assert a decision rather than race one,
 * exactly as the other sweeps take it.
 *
 * ## It drains, where its two neighbours take one page and stop
 *
 * `cleanupStalePayments` and `cleanupOrphanedMedia` both read one `PAGE` and
 * leave the rest to the next tick, which is right for them: an abandoned
 * checkout and a stray logo are rare, so a page an hour is more capacity than
 * either will ever need. This is the opposite shape. One row per client per
 * window means a busy hour leaves thousands, and a sweep that took two hundred
 * of them per tick would fall permanently behind the thing it exists to bound.
 * So it loops until a pass finds nothing.
 *
 * The loop cannot spin: a pass that deletes nothing ends it, whether because
 * the table is drained or because the deletes are failing. The alternative —
 * retrying rows that just refused — is an hourly job that never returns.
 */
export async function pruneRateLimits(
  payload: Payload,
  now: Date
): Promise<void> {
  const cutoff = Math.floor(now.getTime() / MS_PER_SECOND) - RETAIN_SECONDS;

  let deleted = 0;
  let failures = 0;
  let draining = true;

  while (draining) {
    const { docs } = await payload.find({
      collection: "rate-limits",
      depth: 0,
      limit: PAGE,
      overrideAccess: true,
      sort: "windowStart",
      where: { windowStart: { less_than: cutoff } },
    });

    if (docs.length === 0) {
      break;
    }

    const before = deleted;

    for (let start = 0; start < docs.length; start += DELETE_BATCH) {
      const ids = docs.slice(start, start + DELETE_BATCH).map((row) => row.id);

      try {
        const { docs: removed, errors } = await payload.delete({
          collection: "rate-limits",
          overrideAccess: true,
          where: { id: { in: ids } },
        });

        deleted += removed.length;
        failures += errors.length;
      } catch (error) {
        // One batch that cannot be deleted must not end the sweep: the rows
        // behind it are the older ones, and giving up here gives up on them
        // too. The pass-level guard below is what stops this repeating for
        // ever.
        failures += ids.length;
        payload.logger.error(
          { err: error },
          "[pruneRateLimits] A batch of spent counters could not be deleted; they stay until the next sweep"
        );
      }
    }

    draining = deleted > before;
  }

  payload.logger.info(
    `[pruneRateLimits] Deleted ${deleted} spent counter(s); ${failures} failure(s)`
  );
}
