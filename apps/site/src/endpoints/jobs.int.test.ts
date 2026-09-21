// @vitest-environment node
import { readFile } from "node:fs/promises";
import { getPayload, handleEndpoints } from "payload";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import config from "../payload.config";

const SITE = "http://localhost:3003";
const RUN_PATH = "/api/jobs/run";

/** The claim key `endpoints/jobs.ts` serialises the runner with. */
const LEASE_KEY = "job-run:default";

/*
 * A stand-in, never a real credential, and deliberately not shaped like any
 * provider's key. Read and restored through `process.env.JOBS_RUN_TOKEN` on
 * every line that mentions it.
 */
const TOKEN_VAR = "JOBS_RUN_TOKEN";
const STUB_TOKEN = "jobs-run-token-for-tests-only";
const ORIGINAL_TOKEN = process.env[TOKEN_VAR];

/**
 * Sets the server's token, including back to *absent*.
 *
 * `process.env.X = undefined` does not unset X — Node coerces the value and
 * leaves the string `"undefined"` behind, which is a perfectly usable
 * password. `vitest.config.mts` sets `isolate: false`, so every file this
 * worker runs afterwards shares this process. `render.int.test.ts` carries the
 * same helper for the same reason.
 *
 * The member access is computed because Biome's `noDelete` rule bans
 * `delete obj.prop` and offers `obj.prop = undefined` as the fix — which is
 * precisely the bug above.
 */
function setToken(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[TOKEN_VAR];

    return;
  }

  process.env[TOKEN_VAR] = value;
}

/**
 * `GET /api/jobs/run`, driven through `handleEndpoints` against a real
 * database.
 *
 * `handleEndpoints` rather than the handler directly, for the reason
 * `auth.int.test.ts` gives: half of what can go wrong is routing, and a
 * handler called with a hand-built `req` passes whatever path it is mounted
 * at.
 *
 * **The queue exists and is empty here.** It did not exist at all when this
 * file was written — `jobs.enabled` is false until a task is registered, and
 * Task 3 registered the first one — but nothing changed for these tests: an
 * empty queue answers `noJobsRemaining`, so the endpoint logs "Ran 0 jobs"
 * and returns, exactly as it did when there was no queue to ask. That is left
 * alone rather than worked around, because an endpoint that answers
 * differently when the queue is empty is an endpoint that tells an
 * unauthenticated caller whether their token was right, and one of the tests
 * below is exactly that comparison. Everywhere the *run* is the subject
 * rather than the answer, `payload.jobs.run` is spied on, so what is asserted
 * is whether the queue was reached and not what it found.
 */
describe("the job run endpoint", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  /** One invocation, with whatever Authorization header is given. */
  const run = (authorization?: string) =>
    handleEndpoints({
      config,
      request: new Request(`${SITE}${RUN_PATH}`, {
        headers: authorization === undefined ? {} : { authorization },
        method: "GET",
      }),
    });

  /** Everything about a response a caller can see. */
  const snapshot = async (response: Response) => ({
    body: await response.text(),
    headers: [...response.headers.entries()].sort(),
    status: response.status,
  });

  const leases = async () => {
    const { totalDocs } = await payload.find({
      collection: "claims",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: LEASE_KEY } },
    });

    return totalDocs;
  };

  const clearLease = () =>
    payload.delete({
      collection: "claims",
      overrideAccess: true,
      where: { key: { equals: LEASE_KEY } },
    });

  /**
   * Empties the queue.
   *
   * Every run below now evaluates the schedules before it runs anything —
   * Task 5's `handleSchedules` call, without which the four `schedule`
   * properties in `jobs/index.ts` would be decoration — so a tick here leaves
   * one pending row per scheduled task behind. They are not this file's
   * subject, and `.wrangler/state/vitest` is persisted: a row left here is a
   * scheduled job that runs against another file's fixtures the next time
   * anything drains the queue.
   */
  const emptyQueue = () =>
    payload.delete({
      collection: "payload-jobs",
      overrideAccess: true,
      where: { id: { exists: true } },
    });

  /** Replaces the queue with a counter, so "did it run" is observable. */
  const spyOnRun = (behaviour?: () => Promise<unknown>) =>
    vi
      .spyOn(payload.jobs, "run")
      .mockImplementation(
        () =>
          (behaviour?.() ?? Promise.resolve({})) as ReturnType<
            typeof payload.jobs.run
          >
      );

  beforeAll(async () => {
    setToken(STUB_TOKEN);
    payload = await getPayload({ config });
  });

  beforeEach(async () => {
    setToken(STUB_TOKEN);
    await clearLease();
    await emptyQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearLease();
    await emptyQueue();
    setToken(ORIGINAL_TOKEN);
  });

  it("refuses a run with no token", async () => {
    const spy = spyOnRun();

    expect((await run()).status).toBe(200);
    expect(spy).not.toHaveBeenCalled();

    // The positive beside the negative: the same request with the token does
    // run, so this is a refusal and not an endpoint that never works.
    await run(`Bearer ${STUB_TOKEN}`);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("refuses the queue's own endpoint to every signed-in account", async () => {
    /*
     * **Registering a task opens a second door into the queue**, and it is not
     * this file's endpoint. Payload mounts `GET /api/payload-jobs/run` on the
     * jobs collection the moment `jobs.enabled` flips
     * (`queues/endpoints/run.js`), and gates it on
     * `jobs.access.run ?? defaultAccess` — where `defaultAccess` is
     * `Boolean(user)`. Left at the default, every signed-in account could run
     * every scheduled job on demand: a way to force mail, and a way to run the
     * queue *beside* the lease above rather than behind it, which is Review
     * Focus 1 and 2 undone by a config key nobody wrote.
     *
     * So all three callers are asserted — anonymous, a signed-in non-admin and
     * an admin — because a rule that only refuses anonymous callers is
     * indistinguishable from no rule at all against an anonymous request.
     */
    const stamp = crypto.randomUUID().slice(0, 8);
    const password = "jobs-endpoint-password";
    const accounts = await Promise.all(
      (["user", "admin"] as const).map(async (role) => {
        const email = `jobs-${role}-${stamp}@example.test`;

        await payload.create({
          collection: "users",
          data: { email, password, role },
        });
        const { token } = await payload.login({
          collection: "users",
          data: { email, password },
        });

        return `payload-token=${token}`;
      })
    );

    const payloadRun = (cookie?: string) =>
      handleEndpoints({
        config,
        request: new Request(`${SITE}/api/payload-jobs/run`, {
          headers: cookie === undefined ? {} : { Cookie: cookie },
          method: "GET",
        }),
      });

    const spy = spyOnRun();

    for (const cookie of [undefined, ...accounts]) {
      expect((await payloadRun(cookie)).status).toBe(401);
    }

    expect(spy).not.toHaveBeenCalled();

    // The positive beside the negative: the sessions really are sessions, so
    // the 401s above are the access rule refusing and not three anonymous
    // requests wearing cookies Payload ignored.
    for (const cookie of accounts) {
      const { user } = await payload.auth({
        headers: new Headers({ Cookie: cookie }),
      });

      expect(user).not.toBeNull();
    }

    await payload.delete({
      collection: "users",
      where: { email: { like: `jobs-%-${stamp}@example.test` } },
    });
  });

  it("refuses a wrong token", async () => {
    const spy = spyOnRun();

    // A token of the right length, differing in one character — the case a
    // byte-by-byte comparison would leak the position of.
    await run(`Bearer ${STUB_TOKEN.slice(0, -1)}X`);
    // And the same secret presented without the scheme.
    await run(STUB_TOKEN);
    // And an empty bearer, which is what an unset variable on the caller's
    // side produces.
    await run("Bearer ");

    expect(spy).not.toHaveBeenCalled();

    await run(`Bearer ${STUB_TOKEN}`);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("refuses every run when the server has no token configured", async () => {
    // The dangerous reading of "no token" is "no authentication required".
    // Unset, not assigned `undefined` — see `setToken`: the second leaves the
    // string "undefined" behind, which is itself a usable password.
    setToken(undefined);

    const spy = spyOnRun();

    await run("Bearer ");
    await run("Bearer undefined");
    await run(`Bearer ${STUB_TOKEN}`);

    expect(spy).not.toHaveBeenCalled();
    expect(await leases()).toBe(0);
  });

  it("compares the token in constant time", async () => {
    /*
     * Deliberately an assertion about the *implementation* rather than a
     * measurement, for the reason `renderSignature.test.ts` records: a timing
     * measurement in CI fails on a busy machine instead of on a regression,
     * which is a test that trains people to re-run it.
     *
     * Two files, because the comparison is shared with `endpoints/oauth.ts`
     * and `lib/renderSignature.ts` rather than written a third time — so this
     * asserts both that the endpoint delegates to it and that what it
     * delegates to has the property.
     */
    const endpoint = await readFile(
      new URL("jobs.ts", import.meta.url),
      "utf8"
    );
    const comparison = await readFile(
      new URL("../lib/constantTime.ts", import.meta.url),
      "utf8"
    );

    // The token the caller presented is compared through the shared helper,
    // and never with `===` in either direction. (`expected === ""` above it is
    // the "no token configured" guard, not a comparison of the two secrets,
    // which is why the assertions name the presented value rather than
    // forbidding `===` anywhere in the file.)
    expect(endpoint).toMatch(/return equalConstantTime\(presented, expected\)/);
    expect(endpoint).not.toMatch(/presented\s*===/);
    expect(endpoint).not.toMatch(/===\s*presented/);

    expect(comparison).toMatch(/difference \|= /);
    expect(comparison).toMatch(/return difference === 0;/);
  });

  it("answers a wrong token exactly as it answers a missing job queue", async () => {
    // No spy here, so the second call reaches the real `payload.jobs.run`,
    // which finds nothing to run. A caller must not be able to tell that apart
    // from being refused, or the endpoint is an oracle for its own secret: one
    // request per guess, and the answer says whether the guess was right.
    const refused = await snapshot(await run("Bearer not-the-token-at-all"));
    const accepted = await snapshot(await run(`Bearer ${STUB_TOKEN}`));

    expect(accepted).toEqual(refused);
    expect(accepted.status).toBe(200);
  });

  it("runs the queue once when two invocations overlap", async () => {
    // A cron can fire twice and a slow run can be overlapped by the next one.
    // The claim is what serialises them; a `where` cannot — measured on this
    // adapter, where two concurrent conditional updates both reported a
    // changed row.
    let release: () => void = () => {
      // Replaced below before anything can call it.
    };
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = spyOnRun(() => held);

    const both = Promise.all([
      run(`Bearer ${STUB_TOKEN}`),
      run(`Bearer ${STUB_TOKEN}`),
    ]);

    // Both invocations are now past the claim; exactly one is inside the run.
    release();

    const [first, second] = await both;

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when the run finishes, so the next tick runs", async () => {
    const spy = spyOnRun();

    await run(`Bearer ${STUB_TOKEN}`);

    expect(await leases()).toBe(0);

    await run(`Bearer ${STUB_TOKEN}`);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("releases the claim when the run throws", async () => {
    const failing = spyOnRun(() =>
      Promise.reject(new Error("the queue blew up"))
    );

    expect((await run(`Bearer ${STUB_TOKEN}`)).status).toBe(200);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(await leases()).toBe(0);

    // And the tick after the failure gets through.
    await run(`Bearer ${STUB_TOKEN}`);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("does not hold the claim for ever if the worker dies mid-run", async () => {
    // A claim with no expiry is a job that never runs again after one crash.
    // A worker that dies leaves its lease behind with nothing to release it,
    // so the lease has to lapse on its own.
    await payload.create({
      collection: "claims",
      data: {
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
        key: LEASE_KEY,
        kind: "job-run",
      },
      overrideAccess: true,
    });

    const spy = spyOnRun();

    await run(`Bearer ${STUB_TOKEN}`);

    expect(spy).toHaveBeenCalledTimes(1);

    // The negative beside it: a lease that has *not* lapsed still blocks, so
    // this is an expiry rather than a lock that never holds.
    await clearLease();
    await payload.create({
      collection: "claims",
      data: {
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        key: LEASE_KEY,
        kind: "job-run",
      },
      overrideAccess: true,
    });

    await run(`Bearer ${STUB_TOKEN}`);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
