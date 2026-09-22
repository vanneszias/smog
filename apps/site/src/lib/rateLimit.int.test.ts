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

describe("the rate limiter, against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  afterAll(async () => {
    await payload.delete({
      collection: "rate-limits",
      overrideAccess: true,
      where: { key: { like: RUN } },
    });
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
