// @vitest-environment node
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
import { reapStrandedJobs } from "@/jobs/reapStrandedJobs";
import config from "../payload.config";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, and
 * `users.email` refuses duplicates. A collision throws inside `beforeAll`,
 * which Vitest reports as *skipped* rather than failed.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";
const RUN_PATH = "/api/jobs/run";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Duplicated on purpose. `reapStrandedJobs.ts` keeps this string to itself —
 * exporting it would be an export with one caller, and knip fails
 * `bun release:check` on exactly that. A test asserting the literal is the
 * contract; the module's own copy is what production writes.
 */
const STRANDED_MESSAGE =
  "[jobs] Stranded: the run that claimed this job ended without finishing it";

/** The claim key `endpoints/jobs.ts` serialises the runner with. */
const LEASE_KEY = "job-run:default";

/*
 * A stand-in for the run endpoint's shared secret, never a real credential.
 * `isolate: false` means this process is shared with every file that runs
 * after this one, so it is set and unset rather than assigned — assigning
 * `undefined` leaves the string "undefined" behind, which is a usable
 * password. `endpoints/jobs.int.test.ts` carries the same note.
 */
const TOKEN_VAR = "JOBS_RUN_TOKEN";
const STUB_TOKEN = "reap-int-token-for-tests-only";
const ORIGINAL_TOKEN = process.env[TOKEN_VAR];

function setToken(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[TOKEN_VAR];

    return;
  }

  process.env[TOKEN_VAR] = value;
}

/**
 * The reaper, both directly and through the one door that ever calls it —
 * `GET /api/jobs/run`, exactly as Review Focus 4 asks: reaping is only useful
 * if the tick that follows a reap actually queues and runs the freed work,
 * and a bug in the wiring would pass every test that calls the function
 * alone.
 *
 * A fixed `NOW` for the direct cases, so every `updatedAt` below is arithmetic
 * against the same instant rather than a race against `Date.now()`. The
 * endpoint cases cannot share it — `endpoints/jobs.ts` calls
 * `reapStrandedJobs(req.payload, new Date())` with its own clock — so their
 * `updatedAt` is written relative to the real time instead.
 */
describe("reaping a job a killed run left processing", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const NOW = new Date();

  const minutesAgo = (minutes: number) =>
    new Date(NOW.getTime() - minutes * MINUTE).toISOString();

  /** Seeds one `payload-jobs` row, `payload.create` rather than the queue —
   * every field this file forces (`processing`, `totalTried`) is one the
   * queue's own `queue()` call does not accept. */
  const seedJob = (data: Record<string, unknown>) =>
    payload.create({
      collection: "payload-jobs",
      data: { queue: "default", ...data },
      overrideAccess: true,
    });

  /** Overwrites fields no Local API write may — `updatedAt` is stamped by
   * every ordinary update, including the ones this file makes to force a
   * fixture into shape, so getting an exact value onto the row means going
   * beneath the operation that would otherwise overwrite it. */
  const forceRow = (id: number, data: Record<string, unknown>) =>
    payload.db.updateOne({ collection: "payload-jobs", data, id });

  const reload = (id: number) =>
    payload.findByID({
      collection: "payload-jobs",
      depth: 0,
      id,
      overrideAccess: true,
      showHiddenFields: true,
    });

  const emptyQueue = () =>
    payload.delete({
      collection: "payload-jobs",
      overrideAccess: true,
      where: { id: { exists: true } },
    });

  const clearLease = () =>
    payload.delete({
      collection: "claims",
      overrideAccess: true,
      where: { key: { equals: LEASE_KEY } },
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

  /** One tick, exactly as the cron makes it. */
  const tick = () =>
    handleEndpoints({
      config,
      request: new Request(`${SITE}${RUN_PATH}`, {
        headers: { authorization: `Bearer ${STUB_TOKEN}` },
        method: "GET",
      }),
    });

  /**
   * Merges one task's `lastScheduledRun` into `payload-jobs-stats`, the shape
   * `defaultAfterSchedule` itself writes
   * (`queues/operations/handleSchedules/defaultAfterSchedule.js`). Merged
   * rather than replaced: the other three scheduled tasks' own entries are
   * this file's neighbours' business, and `.wrangler/state/vitest` is
   * persisted — clobbering them would make another file's next tick queue
   * jobs it did not ask for.
   */
  const setLastScheduledRun = async (
    taskSlug: string,
    when: Date
  ): Promise<void> => {
    const existing = await payload.findGlobal({
      overrideAccess: true,
      slug: "payload-jobs-stats",
    });
    const stats = (existing.stats ?? {}) as Record<string, unknown>;
    const scheduledRuns = (stats.scheduledRuns ?? {}) as Record<
      string,
      unknown
    >;
    const queues = (scheduledRuns.queues ?? {}) as Record<string, unknown>;
    const queueEntry = (queues.default ?? {}) as Record<string, unknown>;
    const tasks = (queueEntry.tasks ?? {}) as Record<string, unknown>;

    await payload.updateGlobal({
      data: {
        stats: {
          ...stats,
          scheduledRuns: {
            ...scheduledRuns,
            queues: {
              ...queues,
              default: {
                ...queueEntry,
                tasks: {
                  ...tasks,
                  [taskSlug]: { lastScheduledRun: when.toISOString() },
                },
              },
            },
          },
        },
      },
      overrideAccess: true,
      slug: "payload-jobs-stats",
    });
  };

  /** Every message this file's code handed to the email binding. */
  let outbox: { subject: string; text: string; to: string }[] = [];
  let realSendEmail: typeof payload.sendEmail;

  /**
   * Every line any of this file's code put in the log. `deleteJobOnComplete`
   * defaults to `true` (`config/defaults.js`) — a job that runs to a genuine
   * success is deleted the moment `payload.jobs.run` finishes with it, not
   * merely marked complete — so a freshly queued, freshly run
   * `prune-rate-limits` row is gone again before this file can read it back.
   * Its own closing log line, which fires unconditionally
   * (`lib/rateLimit.ts`), is what is left to assert on; `schedules.int.test.ts`
   * reaches for the same evidence for the same reason.
   */
  let logLines: string[] = [];
  const realLog: Record<string, unknown> = {};

  beforeAll(async () => {
    setToken(STUB_TOKEN);
    payload = await getPayload({ config });

    // Case 9 proves a `send-email` job still runs, not that Cloudflare's
    // binding does — `jobs/sendEmail.int.test.ts` owns that evidence. This
    // outbox is the same stand-in `jobs/schedules.int.test.ts` uses.
    realSendEmail = payload.sendEmail;
    payload.sendEmail = ((message: {
      subject?: string;
      text?: unknown;
      to?: unknown;
    }) => {
      outbox.push({
        subject: message.subject ?? "",
        text: String(message.text ?? ""),
        to: String(message.to ?? ""),
      });

      return Promise.resolve({ accepted: true });
    }) as typeof payload.sendEmail;

    const logger = payload.logger as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;

    for (const level of ["error", "info", "warn"]) {
      realLog[level] = logger[level];
      logger[level] = (...args: unknown[]) => {
        logLines.push(args.map((arg) => String(arg)).join(" "));

        return (realLog[level] as (...a: unknown[]) => unknown).apply(
          logger,
          args
        );
      };
    }
  });

  beforeEach(async () => {
    setToken(STUB_TOKEN);
    outbox = [];
    logLines = [];
    await clearLease();
    await emptyQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    payload.sendEmail = realSendEmail;

    const logger = payload.logger as unknown as Record<string, unknown>;

    for (const [level, restore] of Object.entries(realLog)) {
      logger[level] = restore;
    }

    await clearLease();
    await emptyQueue();
    setToken(ORIGINAL_TOKEN);
  });

  /*
   * ---------------------------------------------------------------------
   * Cases 1–7: the function alone, against a fixed clock.
   * ---------------------------------------------------------------------
   */

  it("releases a row still inside its retry budget", async () => {
    const job = await seedJob({ processing: true, taskSlug: "send-email" });

    await forceRow(job.id, { updatedAt: minutesAgo(31) });

    const result = await reapStrandedJobs(payload, NOW);

    expect(result).toEqual({ failed: 0, released: 1 });

    const row = await reload(job.id);

    expect(row.processing).toBe(false);
    expect(row.totalTried).toBe(1);
    expect(row.hasError).toBeFalsy();
    expect(row.error).toBeFalsy();
  });

  it("files a row as failed once its retry budget is spent", async () => {
    const job = await seedJob({
      processing: true,
      taskSlug: "send-email",
      totalTried: 3,
    });

    await forceRow(job.id, { updatedAt: minutesAgo(31) });

    const result = await reapStrandedJobs(payload, NOW);

    expect(result).toEqual({ failed: 1, released: 0 });

    const row = await reload(job.id);

    expect(row.processing).toBe(false);
    expect(row.hasError).toBe(true);
    expect((row.error as { message: string }).message).toBe(STRANDED_MESSAGE);
  });

  it("files a stranded sweep as failed on its first strand, its own attempts being zero", async () => {
    const job = await seedJob({
      processing: true,
      taskSlug: "prune-rate-limits",
    });

    await forceRow(job.id, { updatedAt: minutesAgo(31) });

    const result = await reapStrandedJobs(payload, NOW);

    expect(result).toEqual({ failed: 1, released: 0 });

    const row = await reload(job.id);

    expect(row.processing).toBe(false);
    expect(row.hasError).toBe(true);
    expect((row.error as { message: string }).message).toBe(STRANDED_MESSAGE);
  });

  it("leaves a row a live run could still own alone", async () => {
    const job = await seedJob({ processing: true, taskSlug: "send-email" });

    await forceRow(job.id, { updatedAt: minutesAgo(29) });

    const result = await reapStrandedJobs(payload, NOW);

    expect(result).toEqual({ failed: 0, released: 0 });

    const row = await reload(job.id);

    expect(row.processing).toBe(true);
    expect(row.totalTried ?? 0).toBe(0);
    expect(row.hasError).toBeFalsy();
  });

  it("leaves a row exactly at the window edge alone — the comparison is strict", async () => {
    const job = await seedJob({ processing: true, taskSlug: "send-email" });

    await forceRow(job.id, { updatedAt: minutesAgo(30) });

    const result = await reapStrandedJobs(payload, NOW);

    expect(result).toEqual({ failed: 0, released: 0 });

    const row = await reload(job.id);

    expect(row.processing).toBe(true);
  });

  it("leaves a row nothing has claimed alone, however old", async () => {
    const job = await seedJob({ processing: false, taskSlug: "send-email" });

    await forceRow(job.id, { updatedAt: minutesAgo(120) });

    const result = await reapStrandedJobs(payload, NOW);

    expect(result).toEqual({ failed: 0, released: 0 });

    const row = await reload(job.id);

    expect(row.processing).toBe(false);
    expect(row.hasError).toBeFalsy();
  });

  it("files a row whose task no longer exists in jobsConfig as failed", async () => {
    // `inline` is a real option on the `taskSlug` select — every jobs
    // collection carries it — and is not one of `jobsConfig.tasks`, which is
    // exactly the case this asserts: a row naming a task nothing here
    // registers is bounded at zero attempts, the same as a sweep.
    const job = await seedJob({ processing: true, taskSlug: "inline" });

    await forceRow(job.id, { updatedAt: minutesAgo(31) });

    const result = await reapStrandedJobs(payload, NOW);

    expect(result).toEqual({ failed: 1, released: 0 });

    const row = await reload(job.id);

    expect(row.hasError).toBe(true);
    expect((row.error as { message: string }).message).toBe(STRANDED_MESSAGE);
  });

  it("bounds one tick's work at REAP_LIMIT, leaving the rest for the next tick", async () => {
    const OVERFLOW = 51;

    // Sequential rather than `Promise.all` — 51 concurrent writes against
    // the same table is contention this test has no reason to invite, and
    // this bound is not itself timing-sensitive.
    const seeded: number[] = [];

    for (let index = 0; index < OVERFLOW; index += 1) {
      const job = await seedJob({
        processing: true,
        taskSlug: "prune-rate-limits",
      });

      seeded.push(job.id);
    }

    // One write for all 51: `updatedAt` is what the candidate query keys on,
    // and every row here needs the same stale value, not 51 individually
    // forced ones.
    await payload.db.updateMany({
      collection: "payload-jobs",
      data: { updatedAt: minutesAgo(31) },
      where: { id: { in: seeded } },
    });

    const result = await reapStrandedJobs(payload, NOW);

    // `prune-rate-limits` has no retries, so every row this tick reaches is
    // filed as failed rather than released — the split does not matter here,
    // only that the tick touched exactly `REAP_LIMIT` of the 51.
    expect(result.failed + result.released).toBe(50);
    expect(result.released).toBe(0);

    const { docs: after } = await payload.find({
      collection: "payload-jobs",
      depth: 0,
      limit: OVERFLOW,
      overrideAccess: true,
      where: { id: { in: seeded } },
    });

    expect(after).toHaveLength(OVERFLOW);
    expect(after.filter((job) => job.processing).length).toBe(1);
    expect(after.filter((job) => job.hasError).length).toBe(50);

    await payload.delete({
      collection: "payload-jobs",
      overrideAccess: true,
      where: { id: { in: seeded } },
    });
  });

  /*
   * ---------------------------------------------------------------------
   * Cases 8–9: through the endpoint, where the reaper actually lives.
   * ---------------------------------------------------------------------
   */

  it("frees a stranded scheduled sweep so the same tick queues and runs a fresh one", async () => {
    /*
     * Without the reaper this fails: the stranded row has no `completedAt`
     * and no `error`, so `countRunnableOrActiveJobsForQueue` counts it as
     * still active and `defaultBeforeSchedule` never queues a second one —
     * the exact failure this whole task exists to close. Step 3 of the plan
     * confirms this file fails here before `endpoints/jobs.ts` is wired to
     * call `reapStrandedJobs` at all.
     */
    const stranded = await seedJob({
      meta: { scheduled: true },
      processing: true,
      taskSlug: "prune-rate-limits",
    });

    await forceRow(stranded.id, {
      updatedAt: new Date(Date.now() - 31 * MINUTE).toISOString(),
    });

    // Due several times over, so `nextRun` computed from it is already in
    // the past and the fresh job this tick queues does not have to wait for
    // a second tick to run.
    await setLastScheduledRun(
      "prune-rate-limits",
      new Date(Date.now() - 3 * HOUR)
    );

    expect((await tick()).status).toBe(200);

    // Queued *and* run, in that same tick: `[pruneRateLimits] Deleted …` is
    // that operation's own unconditional closing line
    // (`lib/rateLimit.ts`), so it firing is evidence the sweep actually
    // executed rather than merely being inserted as a row. The row itself
    // cannot be asserted on afterwards — `deleteJobOnComplete` removes a
    // job the instant it completes successfully, before this test can read
    // it back.
    expect(
      logLines.some((line) => line.includes("[pruneRateLimits] Deleted"))
    ).toBe(true);

    // The stranded row itself is not the one that ran — `hasError: true`
    // takes it out of `payload.jobs.run`'s own candidate query
    // (`queues/operations/runJobs/index.js`), so the job above could only
    // be the fresh one `handleSchedules` queued once the reap cleared the
    // count that was blocking it.
    const strandedAfter = await reload(stranded.id);

    expect(strandedAfter.processing).toBe(false);
    expect(strandedAfter.hasError).toBe(true);
  });

  it("does not let the reaper's own failure stop the queue draining or the lease releasing", async () => {
    const email = `reap-${RUN}@example.test`;
    const account = await payload.create({
      collection: "users",
      data: { email, password: "reap-int-password", role: "user" },
    });

    await payload.update({
      collection: "users",
      data: {
        pendingEmail: `reap-new-${RUN}@example.test`,
        pendingEmailExpiresAt: new Date(Date.now() + HOUR).toISOString(),
      },
      id: account.id,
      overrideAccess: true,
    });

    await payload.jobs.queue({
      input: {
        kind: "email-change",
        locale: "nl",
        origin: SITE,
        userId: account.id,
      },
      task: "send-email",
    });

    const realFind = payload.find.bind(payload);

    const findSpy = vi.spyOn(payload, "find").mockImplementation((args) => {
      if (args.collection === "payload-jobs") {
        return Promise.reject(new Error("the reaper's read blew up"));
      }

      return realFind(args);
    });

    try {
      const response = await tick();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });

      vi.restoreAllMocks();

      // The reaper's own read is what actually threw — not some other call
      // that happened to share a mock — and the endpoint's own catch is what
      // caught it, rather than the throw going unnoticed some other way.
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({ collection: "payload-jobs" })
      );
      expect(
        logLines.some((line) =>
          line.includes("[jobs] Could not recover stranded jobs")
        )
      ).toBe(true);

      // The queued `send-email` job still ran this tick, and actually sent —
      // the strongest evidence available, since a successfully completed job
      // is deleted by `deleteJobOnComplete` before this test could read the
      // row back.
      const sent = outbox.find((entry) =>
        entry.to.startsWith(`reap-new-${RUN}`)
      );

      expect(sent).toBeDefined();

      // And the lease is released, exactly as it is when the run itself
      // throws — a reaper failure is caught before the run, not instead of
      // the `finally` that releases it.
      expect(await leases()).toBe(0);
    } finally {
      vi.restoreAllMocks();
      await payload.delete({
        collection: "users",
        id: account.id,
        overrideAccess: true,
      });
    }
  });
});
