// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { jobsConfig } from "@/jobs";
import config from "../payload.config";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, so
 * a fixture keyed on a fixed name collides with an earlier run's row. A
 * collision throws inside `beforeAll`, which Vitest reports as *skipped*
 * rather than failed — a file that looks green having asserted nothing.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";
const DAY = 24 * 60 * 60 * 1000;
const PRICE = 5000;

/*
 * A stand-in for the run endpoint's shared secret, never a real credential.
 * `isolate: false` means this process is shared with every file that runs
 * after this one, so it is set and unset rather than assigned — assigning
 * `undefined` leaves the string "undefined" behind, which is a usable
 * password. `endpoints/jobs.int.test.ts` carries the same note.
 */
const TOKEN_VAR = "JOBS_RUN_TOKEN";
const STUB_TOKEN = "schedules-int-token-for-tests-only";
const ORIGINAL_TOKEN = process.env[TOKEN_VAR];

interface SentMessage {
  subject: string;
  text: string;
  to: string;
}

/**
 * The cron, end to end: a `schedule` reaching the queue, and the queue running
 * it.
 *
 * ## Why this file exists at all, stated before anything is asserted
 *
 * **`payload.jobs.run` does not schedule anything.** A task's `schedule` is
 * acted on by `payload.jobs.handleSchedules` and by nothing else: Payload's own
 * `GET /api/payload-jobs/run` calls it before running the queue
 * (`queues/endpoints/run.js`), and the Local API's `run` does not
 * (`queues/localAPI.js`). `endpoints/jobs.ts` uses the Local API, because
 * `jobs.access.run` is `denyAll` and Payload's endpoint is closed to
 * everybody — so the four `schedule` properties in `jobs/index.ts` are inert
 * unless that endpoint calls `handleSchedules` itself.
 *
 * A test that asserted "the task is registered with this cron string" would
 * pass against exactly that defect: four jobs that are never queued, and a
 * cron firing every hour into an endpoint that answers `200` and does nothing.
 * So the assertion here is a **row in `payload-jobs`**, and then a **sponsor
 * who got their reminder**, with the structural check kept alongside rather
 * than instead.
 *
 * ## What is real here and what is not
 *
 * The queue, the schedule evaluation, the `waitUntil`, the
 * `payload-jobs-stats` global and the run are all Payload's own, against a
 * real database and through the real HTTP endpoint. `payload.sendEmail` is
 * replaced with an outbox, so **nothing here is evidence about Cloudflare**;
 * Task 7 is first contact.
 *
 * The one thing no test can stage is the Cloudflare Cron Trigger itself,
 * because a Cron Trigger invokes a Worker's `scheduled()` handler rather than
 * calling a URL, and OpenNext's generated worker exports only `fetch`. That
 * seam is `src/jobs/cron.ts` and it is unit-tested there; what this file
 * proves is everything on the other side of the fetch it makes.
 */
describe("the scheduled jobs", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  let outbox: SentMessage[] = [];
  /** Every line this worker's code put in the log, flattened to strings. */
  let logLines: string[] = [];
  let realSendEmail: typeof payload.sendEmail;
  const realLog: Record<string, unknown> = {};

  /** One tick, exactly as the cron makes it. */
  const tick = () =>
    handleEndpoints({
      config,
      request: new Request(`${SITE}/api/jobs/run`, {
        headers: { authorization: `Bearer ${STUB_TOKEN}` },
        method: "GET",
      }),
    });

  const jobs = async (taskSlug?: string) => {
    const { docs } = await payload.find({
      collection: "payload-jobs",
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: "-createdAt",
      ...(taskSlug === undefined
        ? {}
        : { where: { taskSlug: { equals: taskSlug } } }),
    });

    return docs;
  };

  const emptyQueue = () =>
    payload.delete({
      collection: "payload-jobs",
      overrideAccess: true,
      where: { id: { exists: true } },
    });

  /** Makes every pending job runnable now, so a tick picks it up. */
  const clearWaits = async () => {
    for (const job of await jobs()) {
      await payload.update({
        collection: "payload-jobs",
        data: { waitUntil: null },
        id: job.id,
        overrideAccess: true,
      });
    }
  };

  const seedSponsorship = async (
    label: string,
    endsInDays: number
  ): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Schedule ${label} ${RUN}`,
        playbackId: `pb-schedule-${label}-${RUN}`,
      },
      locale: "nl",
    });
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(Date.now() + endsInDays * DAY).toISOString(),
        gesture: gesture.id,
        originalVideoPlaybackId: `pb-schedule-${label}-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        sponsorEmail: `schedule-${label}-${RUN}@example.test`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(Date.now() - DAY).toISOString(),
        status: "active",
      },
    });

    return row.id;
  };

  beforeAll(async () => {
    process.env[TOKEN_VAR] = STUB_TOKEN;
    payload = await getPayload({ config });

    /*
     * Every sponsorship this file has ever seeded, from every earlier run.
     *
     * `.wrangler/state/vitest` is persisted and `RUN` is new each time, so
     * these accumulate — and an `active` sponsorship inside the renewal window
     * that nobody reminded is one the sweep below picks up for ever. Left
     * alone they make a tick's work grow with how many times the suite has
     * been run, which is a test that gets slower and then fails.
     */
    await payload.delete({
      collection: "sponsorships",
      overrideAccess: true,
      where: { sponsorEmail: { like: "schedule-" } },
    });

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

    /*
     * Every log line, at every level. The only evidence a *registered* task
     * actually ran the operation it is named after is the sentence that
     * operation writes when it finishes — there is no return value to read
     * from outside the queue.
     */
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

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Schedule ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  beforeEach(async () => {
    outbox = [];
    logLines = [];
    await emptyQueue();
  });

  afterAll(async () => {
    payload.sendEmail = realSendEmail;

    const logger = payload.logger as unknown as Record<string, unknown>;

    for (const [level, restore] of Object.entries(realLog)) {
      logger[level] = restore;
    }

    if (ORIGINAL_TOKEN === undefined) {
      delete process.env[TOKEN_VAR];
    } else {
      process.env[TOKEN_VAR] = ORIGINAL_TOKEN;
    }

    // The queue is shared with every other file in this worker, and a
    // scheduled row left behind is one that runs — against their fixtures —
    // the next time anything drains the queue.
    await emptyQueue();
  });

  it("boots with the fixtures this file assumes", async () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that seeded nothing would look green.
    expect(categoryId).toBeGreaterThan(0);
    expect(await jobs()).toEqual([]);
  });

  it("registers all four tasks with the schedules the spec names", () => {
    /*
     * The spec's "Jobs and scheduling" names four tasks and three clocks:
     * expiry daily, the renewal reminder daily, stale payments hourly, and
     * `send-email` queued on demand by hooks. The cron expressions are the
     * shipped `node-cron` ones (`apps/server/src/cron.ts`), transcribed.
     *
     * Structural, and kept beside the behavioural tests below rather than
     * instead of them: this catches a cron string nobody meant to change, and
     * it would pass unchanged against the defect that the rest of this file
     * exists to catch.
     */
    const byTask = new Map(
      (jobsConfig.tasks ?? []).map((task) => [
        task.slug,
        (task.schedule ?? []).map(({ cron, queue }) => `${queue}:${cron}`),
      ])
    );

    expect([...byTask.keys()].sort()).toEqual([
      "cleanup-stale-payments",
      "expire-sponsorships",
      "send-email",
      "send-renewal-reminders",
    ]);

    expect(byTask.get("cleanup-stale-payments")).toEqual(["default:0 * * * *"]);
    expect(byTask.get("expire-sponsorships")).toEqual(["default:0 0 * * *"]);
    expect(byTask.get("send-renewal-reminders")).toEqual(["default:0 8 * * *"]);

    // And the one that must *not* be scheduled: a `send-email` job with no
    // recipient is a job that cannot do anything but fail.
    expect(byTask.get("send-email")).toEqual([]);
  });

  it("puts a scheduled job in the queue, which the queue runner alone never does", async () => {
    /*
     * **The landmine, asserted in both directions.**
     *
     * First the defect: `payload.jobs.run` is exactly what `endpoints/jobs.ts`
     * calls, and on its own it queues nothing at all — the four `schedule`
     * properties are invisible to it. If this expectation ever stops holding,
     * Payload has changed and the endpoint's extra call is redundant rather
     * than load-bearing.
     */
    await payload.jobs.run({
      limit: 10,
      overrideAccess: true,
      queue: "default",
      sequential: true,
    });

    expect(await jobs()).toEqual([]);

    // Then the endpoint, which is the same run with `handleSchedules` in front
    // of it. Three scheduled tasks, three rows, each waiting for its own next
    // occurrence rather than running immediately.
    expect((await tick()).status).toBe(200);

    const queued = await jobs();
    const slugs = queued.map((job) => job.taskSlug).sort();

    expect(slugs).toEqual([
      "cleanup-stale-payments",
      "expire-sponsorships",
      "send-renewal-reminders",
    ]);

    for (const job of queued) {
      expect((job.meta as { scheduled?: boolean } | null)?.scheduled).toBe(
        true
      );
      expect(Date.parse(String(job.waitUntil))).toBeGreaterThan(Date.now());
    }
  });

  it("does not queue a second copy while one is still waiting", async () => {
    // A cron that fires every hour evaluates every schedule every hour. The
    // steady state has to be one pending row per task, or an hourly tick
    // queues a daily job twenty-four times a day.
    await tick();
    await tick();
    await tick();

    expect(await jobs("expire-sponsorships")).toHaveLength(1);
    expect(await jobs("cleanup-stale-payments")).toHaveLength(1);
  });

  it("runs a scheduled job when its wait is over, and the sponsor gets the mail", async () => {
    /*
     * The whole chain, and the reason the structural test above is not enough:
     * cron -> endpoint -> `handleSchedules` -> a row -> `payload.jobs.run` ->
     * the sweep -> a `send-email` row -> the message -> the stamp.
     *
     * Nothing here mocks the queue. What stands in for the clock is clearing
     * `waitUntil`, which is what the passage of time does to these rows;
     * waiting eight hours for the reminder's own cron is not a test.
     */
    const id = await seedSponsorship("chain", 10);

    // Tick one: the schedules are evaluated and nothing is due yet.
    await tick();
    expect(await jobs("send-renewal-reminders")).toHaveLength(1);
    expect(outbox).toEqual([]);

    // Tick two: the sweep runs and queues the sponsor's message.
    await clearWaits();
    await tick();

    /*
     * This sponsorship's message, not "the queue's". The sweep is global and
     * `.wrangler/state/vitest` is persisted, so every earlier run of this file
     * has left active sponsorships behind for it to find — and an assertion
     * about the whole queue would be an assertion about how many times the
     * suite has been run. It read twelve once, during a mutation run, which is
     * how this was found.
     */
    const message = (await jobs("send-email")).filter(
      (job) => (job.input as { sponsorshipId?: number })?.sponsorshipId === id
    );

    expect(message).toHaveLength(1);

    /*
     * Everybody else's messages, out of the way. The sweep is global — it
     * queues one for every sponsorship in the window, including whatever other
     * files in this worker have seeded — and a tick takes ten jobs at a time,
     * so which ten is not a property this test should depend on. The tick
     * itself stays real; only the backlog around it is removed.
     */
    for (const other of await jobs("send-email")) {
      if ((other.input as { sponsorshipId?: number })?.sponsorshipId !== id) {
        await payload.delete({
          collection: "payload-jobs",
          id: other.id,
          overrideAccess: true,
        });
      }
    }

    // Tick three: the message is sent, and the column that has existed since
    // Stage 1 with nothing to write it is finally written.
    await clearWaits();
    await tick();

    const sent = outbox.find((entry) =>
      entry.to.startsWith(`schedule-chain-${RUN}`)
    );

    expect(sent).toBeDefined();
    expect(sent?.subject).toBe("Je SMOG-sponsoring verloopt binnenkort");

    /*
     * The link is built on *this* host, which is the whole reason
     * `endpoints/jobs.ts` hands its own request to `payload.jobs.run`. A job
     * running under the request Payload would otherwise synthesise has an
     * origin of `http://localhost` with no port — a working link to nowhere —
     * so the port is the assertion.
     */
    expect(sent?.text).toContain(`${SITE}/nl/sponsor`);

    const row = await payload.findByID({
      collection: "sponsorships",
      depth: 0,
      id,
      overrideAccess: true,
    });

    expect(row.renewalReminderSentAt).toBeTruthy();
  });

  it("runs every operation each scheduled task is named after", async () => {
    /*
     * A task's handler is wiring, and wiring is where an operation goes
     * missing without anything failing. `expire-sponsorships` is **two**
     * operations in one task — the expiry and the readiness sweep — and they
     * are one task because the second deliberately skips a render whose
     * sponsorship is terminal, on the grounds that the first is about to
     * delete its asset. A handler that called only the first would leave the
     * sweep Stage 6 built running nowhere at all, and every other test in this
     * file would still pass.
     *
     * The evidence is each operation's own closing log line, because a job run
     * from inside the queue has no return value anybody outside it can read.
     */
    await tick();
    await clearWaits();
    logLines = [];
    await tick();

    const said = (fragment: string) =>
      logLines.filter((line) => line.includes(fragment));

    expect(said("[expireSponsorships] Expired")).not.toEqual([]);
    expect(said("[expireSponsorships] Checked")).not.toEqual([]);
    expect(said("[sendRenewalReminders] Queued")).not.toEqual([]);
    expect(said("[cleanupStalePayments] Cancelled")).not.toEqual([]);
  });

  it("still drains the queue when the schedules cannot be evaluated", async () => {
    /*
     * A schedule that cannot be evaluated is a schedule that will be evaluated
     * again in an hour. The jobs already in the queue are messages somebody is
     * waiting for, and letting one failure stop the other is how a single bad
     * night becomes a queue that never drains again.
     */
    const id = await seedSponsorship("resilient", 10);

    await payload.jobs.queue({
      input: {
        kind: "renewal-reminder",
        locale: "nl",
        origin: SITE,
        sponsorshipId: id,
      },
      task: "send-email",
    });

    const realHandleSchedules = payload.jobs.handleSchedules;

    payload.jobs.handleSchedules = (() =>
      Promise.reject(
        new Error("the stats global is on fire")
      )) as typeof payload.jobs.handleSchedules;

    try {
      expect((await tick()).status).toBe(200);
    } finally {
      payload.jobs.handleSchedules = realHandleSchedules;
    }

    expect(
      outbox.filter((entry) => entry.to.startsWith(`schedule-resilient-${RUN}`))
    ).toHaveLength(1);
  });
});
