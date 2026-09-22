// @vitest-environment node
import { getPayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import { pruneRateLimits, takeRateLimit } from "./rateLimit";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, so
 * a fixture keyed on a fixed name collides with an earlier run's row on
 * `rate_limits.key` — which is UNIQUE, and is the whole mechanism. A collision
 * throws inside `beforeAll`, which Vitest reports as *skipped* rather than
 * failed: a file that looks green having asserted nothing.
 */
const RUN = crypto.randomUUID();

const WINDOW_SECONDS = 60;
const SERIAL_LIMIT = 3;
const CONCURRENT_LIMIT = 10;
const CONCURRENT_CALLS = 20;
/** Rows per teardown delete, under D1's cap of 100 bind parameters. */
const TEARDOWN_BATCH = 50;

describe("the rate limiter, against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  /*
   * Batched for the same reason `pruneRateLimits` is: `payload.delete` emits
   * one bind parameter per deleted document into its trailing
   * `payload_preferences` delete, and D1 refuses at 100. The backlog test
   * below leaves nothing behind when it passes — but when it *fails* it
   * leaves a hundred and fifty rows, and a teardown that then threw would
   * bury the failure this file exists to report under a second one.
   */
  afterAll(async () => {
    for (;;) {
      const { docs } = await payload.find({
        collection: "rate-limits",
        depth: 0,
        limit: TEARDOWN_BATCH,
        overrideAccess: true,
        where: { key: { like: RUN } },
      });

      if (docs.length === 0) {
        return;
      }

      await payload.delete({
        collection: "rate-limits",
        overrideAccess: true,
        where: { id: { in: docs.map((row) => row.id) } },
      });
    }
  });

  const take = (key: string, limit = SERIAL_LIMIT) =>
    takeRateLimit({
      key,
      limit,
      namespace: `test-${RUN}`,
      payload,
      windowSeconds: WINDOW_SECONDS,
    });

  it("allows up to the limit and refuses the next one", async () => {
    const key = `serial-${crypto.randomUUID()}`;

    for (let attempt = 1; attempt <= SERIAL_LIMIT; attempt += 1) {
      const verdict = await take(key);
      // The attempt number is folded into the assertion so a failure names the
      // call that was refused rather than only reporting `false`.
      expect(`${attempt}:${verdict.allowed}`).toBe(`${attempt}:true`);
    }

    const refused = await take(key);
    expect(refused.allowed).toBe(false);
    if (refused.allowed === false) {
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_SECONDS);
    }
  });

  it("counts each client separately", async () => {
    const mine = `mine-${crypto.randomUUID()}`;
    const theirs = `theirs-${crypto.randomUUID()}`;

    for (let attempt = 0; attempt < SERIAL_LIMIT; attempt += 1) {
      await take(mine);
    }

    expect((await take(mine)).allowed).toBe(false);
    expect((await take(theirs)).allowed).toBe(true);
  });

  it("counts each namespace separately", async () => {
    /*
     * The `claims.kind` property, one table over: two features sharing a
     * keyspace would mean one feature's traffic spending another's budget. The
     * same client key is driven past its limit in one namespace and then used
     * in a second.
     */
    const key = `shared-${crypto.randomUUID()}`;
    const other = {
      key,
      limit: SERIAL_LIMIT,
      namespace: `other-${RUN}`,
      payload,
      windowSeconds: WINDOW_SECONDS,
    };

    for (let attempt = 0; attempt < SERIAL_LIMIT; attempt += 1) {
      await take(key);
    }

    expect((await take(key)).allowed).toBe(false);
    expect((await takeRateLimit(other)).allowed).toBe(true);
  });

  /*
   * The whole reason this module could not be ported. The Redis original used
   * INCR, which is atomic in the store; D1 has no transactions, so whatever
   * replaces it has to be atomic in the INSERT or honest about not being.
   *
   * This is the Step 1 gate, and it asserts design (b) — upsert-and-return —
   * exactly. Measured against design (a), count-then-insert, the same twenty
   * calls at the same limit of ten yielded **twenty** allowed: not an
   * overshoot to be bounded but no limiter at all under the traffic shape a
   * limiter exists for. The number below is therefore an equality and not a
   * ceiling, and `lib/rateLimit.ts` carries both measurements.
   */
  it("holds under concurrency", async () => {
    const key = `concurrent-${crypto.randomUUID()}`;

    const verdicts = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () =>
        take(key, CONCURRENT_LIMIT)
      )
    );
    const allowed = verdicts.filter((verdict) => verdict.allowed).length;

    expect(allowed).toBe(CONCURRENT_LIMIT);
  });

  it("drains a backlog larger than D1's bind-parameter cap", async () => {
    /*
     * **The sweep's own bound, which is not the same thing as its filter.**
     *
     * `payload.delete` with a `where` resolves every matching row and then
     * emits one bind parameter per row into the trailing
     * `delete from "payload_preferences" where key in (?, …)`. D1's documented
     * cap is 100, so an unbounded sweep deletes the rows and *then* throws —
     * retention still happens, but the hourly task is filed failed on every
     * run and the closing log line `jobs/schedules.int.test.ts` asserts never
     * appears in production. `jobs/cleanupOrphanedMedia.ts` records this
     * repo's earlier encounter with the same cap, at 132 parameters.
     *
     * A public beacon sees far more than a hundred distinct addresses in an
     * hour, so the count here is above the cap on purpose: at ninety this test
     * passes against the unbounded version and proves nothing.
     */
    const BACKLOG = 150;
    const SPAWN = 50;
    const key = `backlog-${crypto.randomUUID()}`;

    for (let start = 0; start < BACKLOG; start += SPAWN) {
      await Promise.all(
        Array.from({ length: Math.min(SPAWN, BACKLOG - start) }, (_, index) =>
          payload.create({
            collection: "rate-limits",
            data: {
              count: 1,
              key: `test-${RUN}:${key}-${start + index}`,
              windowStart: 0,
            },
            overrideAccess: true,
          })
        )
      );
    }

    await pruneRateLimits(payload, new Date());

    const { totalDocs } = await payload.count({
      collection: "rate-limits",
      overrideAccess: true,
      where: { key: { like: key } },
    });

    expect(totalDocs).toBe(0);
    /*
     * Its own timeout, and the one test in this file that needs one. The
     * assertion costs a hundred and fifty round trips to a real D1 before it
     * asserts anything: measured at 13.9s and 14.2s locally and unloaded,
     * against the suite's 30s default. `vitest.config.mts` records what
     * happens when a test sits at twice its limit while CI runs one worker
     * under load — whichever is slowest that run goes red. Sixty seconds is
     * roughly four times the measurement; a genuinely hung test still fails,
     * just later. Lowering the count instead is the wrong trade: below a
     * hundred rows this test passes against the defect it exists to catch.
     */
  }, 60_000);

  it("keeps the live window and takes the spent ones", async () => {
    /*
     * The retention sweep, and the mistake it must not make. These rows are
     * derived from client addresses, so keeping them past the window they
     * govern serves nobody — but a sweep that reached the *current* window
     * would hand whoever was in it a fresh budget, which is a limiter that
     * resets whenever the hourly job runs.
     */
    const key = `pruned-${crypto.randomUUID()}`;
    const spent = `${`test-${RUN}`}:${key}:0`;

    await payload.create({
      collection: "rate-limits",
      data: { count: 99, key: spent, windowStart: 0 },
      overrideAccess: true,
    });

    for (let attempt = 0; attempt < SERIAL_LIMIT; attempt += 1) {
      await take(key);
    }

    await pruneRateLimits(payload, new Date());

    const { totalDocs: spentRows } = await payload.count({
      collection: "rate-limits",
      overrideAccess: true,
      where: { key: { equals: spent } },
    });
    expect(spentRows).toBe(0);

    // The live window survived, so the budget spent above is still spent.
    expect((await take(key)).allowed).toBe(false);
  });
});
