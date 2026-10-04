/**
 * The render watchdog (phase 7 ruling 12): every row of its table with a
 * fake Workflow status port, `terminate` before `failRender` on the
 * ceiling row, only the requeue row without a binding, one effect when
 * run twice, its place in the hourly stale sweep, and the seek on
 * migration 0011's index.
 */
import { env } from "cloudflare:workers";
import { renderJob } from "@smog/db";
import type { EmailMessage, EventMessage, JobQueues } from "@smog/jobs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderJob, markRenderRunning } from "../src/server/render";
import {
  instanceErrorSummary,
  RENDER_QUEUED_GRACE_MS,
  RENDER_WATCHDOG_BUDGET,
  reconcileRenderJobs,
  type WorkflowInstanceState,
  type WorkflowStatusPort,
  watchdogQuery,
} from "../src/server/render-watchdog";
import { RENDER_WATCHDOG_CEILING } from "../src/server/render-workflow";
import { runStaleSweep } from "../src/server/sweeps";
import { clearSponsorships } from "./clean";
import {
  eventsOf,
  makeAdmin,
  NOW,
  SITE_URL,
  seedCheckout,
  statusOf,
  testDb,
} from "./helpers";

const db = testDb();

beforeEach(async () => {
  await clearSponsorships(db);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

function recordingQueues() {
  const events: EventMessage[] = [];
  const emails: EmailMessage[] = [];
  const queues: JobQueues = {
    email: {
      send: (body) => {
        emails.push(body);
        return Promise.resolve();
      },
    },
    events: {
      send: (body) => {
        events.push(body);
        return Promise.resolve();
      },
    },
  };
  return { emails, events, queues };
}

/** One keyed `admin_render_failed` per admin (the admins of earlier tests too), once. */
function expectAdminEmails(emails: EmailMessage[], renderJobId: string) {
  const keys = emails.map((email) => email.idempotencyKey);
  expect(keys.length).toBeGreaterThan(0);
  expect(new Set(keys).size).toBe(keys.length);
  for (const key of keys) {
    expect(key).toContain(`admin_render_failed:${renderJobId}:`);
  }
}

type Answer = WorkflowInstanceState | "not-found";

/** A status port answering `answers[instanceId]`, recording every call in order. */
function fakePort(answers: Record<string, Answer>) {
  const calls: string[] = [];
  const port: WorkflowStatusPort = {
    status: (id) => {
      calls.push(`status:${id}`);
      return Promise.resolve(answers[id] ?? "not-found");
    },
    terminate: (id) => {
      calls.push(`terminate:${id}`);
      return Promise.resolve();
    },
  };
  return { calls, port };
}

const OLD_QUEUED = new Date(NOW.getTime() - RENDER_QUEUED_GRACE_MS - 1);
const FRESH_QUEUED = new Date(NOW.getTime() - RENDER_QUEUED_GRACE_MS + 60_000);
const PAST_CEILING = new Date(NOW.getTime() - RENDER_WATCHDOG_CEILING - 1);
const RECENT = new Date(NOW.getTime() - 60_000);

/** A `rendering` sponsorship with one job, `queued` or `running`, last touched at `updatedAt`. */
async function job(status: "queued" | "running", updatedAt: Date) {
  const seeded = await seedCheckout(db, {
    count: 1,
    paymentStatus: "paid",
    status: "rendering",
  });
  const sponsorshipId = seeded.sponsorshipIds[0] as string;
  const created = await createRenderJob(db, { now: NOW, sponsorshipId });
  const id = created?.renderJobId as string;
  if (status === "running") {
    await markRenderRunning(db, { now: NOW, renderJobId: id });
  }
  await db.update(renderJob).set({ updatedAt }).where(eq(renderJob.id, id));
  return { id, sponsorshipId };
}

async function jobRow(id: string) {
  const [row] = await db.select().from(renderJob).where(eq(renderJob.id, id));
  return row;
}

async function run(
  workflow: WorkflowStatusPort | null,
  queues: JobQueues,
  now = NOW
) {
  return await reconcileRenderJobs({
    db,
    now,
    queues,
    siteUrl: SITE_URL,
    workflow,
  });
}

describe("reconcileRenderJobs (ruling 12)", () => {
  it("re-enqueues a queued job older than 10 minutes whose instance is not found, once", async () => {
    const old = await job("queued", OLD_QUEUED);
    const fresh = await job("queued", FRESH_QUEUED);
    const { port } = fakePort({});
    const { events, queues } = recordingQueues();

    const first = await run(port, queues);
    const second = await run(port, queues);

    expect(first).toEqual({ failed: 0, requeued: 1, timedOut: 0 });
    expect(second).toEqual({ failed: 0, requeued: 0, timedOut: 0 });
    expect(events).toEqual([{ renderJobId: old.id, type: "render.requested" }]);
    expect((await jobRow(old.id))?.status).toBe("queued");
    expect((await jobRow(fresh.id))?.status).toBe("queued");
  });

  it("without a binding only the requeue row applies (fake mode)", async () => {
    const queued = await job("queued", OLD_QUEUED);
    const running = await job("running", PAST_CEILING);
    const { events, queues } = recordingQueues();

    const result = await run(null, queues);

    expect(result).toEqual({ failed: 0, requeued: 1, timedOut: 0 });
    expect(events).toEqual([
      { renderJobId: queued.id, type: "render.requested" },
    ]);
    expect((await jobRow(running.id))?.status).toBe("running");
    expect(await statusOf(db, running.sponsorshipId)).toBe("rendering");
  });

  it.each(["complete", "errored", "terminated"] as const)(
    "fails a queued job whose instance is %s, with the admin emails",
    async (status) => {
      await makeAdmin(db);
      const queued = await job("queued", OLD_QUEUED);
      const { port } = fakePort({ [queued.id]: { status } });
      const { emails, events, queues } = recordingQueues();

      const first = await run(port, queues);
      const second = await run(port, queues);

      expect(first).toEqual({ failed: 1, requeued: 0, timedOut: 0 });
      expect(second).toEqual({ failed: 0, requeued: 0, timedOut: 0 });
      expect(events).toEqual([]);
      expect(await jobRow(queued.id)).toMatchObject({
        error: "workflow ended without a result",
        status: "failed",
      });
      expect(await statusOf(db, queued.sponsorshipId)).toBe("render_failed");
      expectAdminEmails(emails, queued.id);
    }
  );

  it("fails a running job whose instance errored, with its error summary and no URL", async () => {
    await makeAdmin(db);
    const running = await job("running", RECENT);
    const { port } = fakePort({
      [running.id]: {
        error: {
          message:
            "render failed for https://master.mux.com/abc.mp4?token=secret",
          name: "Error",
        },
        status: "errored",
      },
    });
    const { emails, queues } = recordingQueues();

    expect(await run(port, queues)).toEqual({
      failed: 1,
      requeued: 0,
      timedOut: 0,
    });
    const stored = await jobRow(running.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toBe(
      "workflow errored: Error: render failed for [url]"
    );
    expect(stored?.error).not.toContain("mux.com");
    expect(await statusOf(db, running.sponsorshipId)).toBe("render_failed");
    expectAdminEmails(emails, running.id);
  });

  it.each([
    ["terminated", { status: "terminated" }, "workflow terminated"],
    [
      "complete (the commit was lost)",
      { status: "complete" },
      "workflow completed without a result",
    ],
    ["not found", "not-found", "workflow not found"],
  ] as const)(
    "fails a running job whose instance is %s",
    async (_label, answer, error) => {
      const running = await job("running", RECENT);
      const { port } = fakePort({ [running.id]: answer as Answer });
      const { queues } = recordingQueues();

      const first = await run(port, queues);
      const second = await run(port, queues);

      expect(first).toEqual({ failed: 1, requeued: 0, timedOut: 0 });
      expect(second).toEqual({ failed: 0, requeued: 0, timedOut: 0 });
      expect(await jobRow(running.id)).toMatchObject({
        error,
        status: "failed",
      });
      expect(
        (await eventsOf(db, running.sponsorshipId)).map((event) => event.type)
      ).toEqual(["render_started", "render_failed"]);
    }
  );

  it.each([
    "queued",
    "running",
    "waiting",
    "paused",
    "waitingForPause",
    "rollingBack",
  ] as const)(
    "terminates a running job past the ceiling (%s) before failing it",
    async (status) => {
      const running = await job("running", PAST_CEILING);
      const { calls, port } = fakePort({ [running.id]: { status } });
      const { queues } = recordingQueues();
      const { terminate } = port;
      port.terminate = async (id) => {
        // `failRender` has not run yet when the instance is terminated.
        expect((await jobRow(running.id))?.status).toBe("running");
        await terminate(id);
      };

      const first = await run(port, queues);
      const second = await run(port, queues);

      expect(first).toEqual({ failed: 0, requeued: 0, timedOut: 1 });
      expect(second).toEqual({ failed: 0, requeued: 0, timedOut: 0 });
      expect(calls).toEqual([
        `status:${running.id}`,
        `terminate:${running.id}`,
      ]);
      expect(await jobRow(running.id)).toMatchObject({
        error: "timed out",
        status: "failed",
      });
    }
  );

  it.each([
    "queued",
    "running",
    "waiting",
    "paused",
    "waitingForPause",
    "rollingBack",
  ] as const)(
    "leaves a job whose instance is %s before the ceiling",
    async (status) => {
      const queued = await job("queued", OLD_QUEUED);
      const running = await job("running", RECENT);
      const { calls, port } = fakePort({
        [queued.id]: { status },
        [running.id]: { status },
      });
      const { events, queues } = recordingQueues();

      expect(await run(port, queues)).toEqual({
        failed: 0,
        requeued: 0,
        timedOut: 0,
      });
      expect(calls.filter((call) => call.startsWith("terminate"))).toEqual([]);
      expect(events).toEqual([]);
      expect((await jobRow(queued.id))?.status).toBe("queued");
      expect((await jobRow(running.id))?.status).toBe("running");
    }
  );

  it.each(["queued", "paused", "rollingBack"] as const)(
    "terminates a queued job past the ceiling whose instance is still %s, then fails it",
    async (status) => {
      const queued = await job("queued", PAST_CEILING);
      const { calls, port } = fakePort({ [queued.id]: { status } });
      const { events, queues } = recordingQueues();

      const first = await run(port, queues);
      const second = await run(port, queues);

      expect(first).toEqual({ failed: 0, requeued: 0, timedOut: 1 });
      expect(second).toEqual({ failed: 0, requeued: 0, timedOut: 0 });
      expect(calls).toEqual([`status:${queued.id}`, `terminate:${queued.id}`]);
      expect(events).toEqual([]);
      expect(await jobRow(queued.id)).toMatchObject({
        error: "timed out",
        status: "failed",
      });
      expect(await statusOf(db, queued.sponsorshipId)).toBe("render_failed");
    }
  );

  it("a terminate that throws leaves the job; the next run fails it as terminated", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const running = await job("running", PAST_CEILING);
    const answers: Record<string, Answer> = {
      [running.id]: { status: "running" },
    };
    const { port } = fakePort(answers);
    port.terminate = () =>
      Promise.reject(new Error("instance is already complete"));
    const { queues } = recordingQueues();

    expect(await run(port, queues)).toEqual({
      failed: 0,
      requeued: 0,
      timedOut: 0,
    });
    expect((await jobRow(running.id))?.status).toBe("running");
    expect(error).toHaveBeenCalledWith(
      `[sponsorships] Failed to reconcile render job ${running.id}; the next run retries:`,
      expect.any(Error)
    );

    answers[running.id] = { status: "terminated" };
    expect(await run(port, queues)).toEqual({
      failed: 1,
      requeued: 0,
      timedOut: 0,
    });
    expect(await jobRow(running.id)).toMatchObject({
      error: "workflow terminated",
      status: "failed",
    });
    error.mockRestore();
  });

  it("logs and leaves a job whose instance is unknown", async () => {
    const queued = await job("queued", OLD_QUEUED);
    const running = await job("running", PAST_CEILING);
    const { calls, port } = fakePort({
      [queued.id]: { status: "unknown" },
      [running.id]: { status: "unknown" },
    });
    const { events, queues } = recordingQueues();

    expect(await run(port, queues)).toEqual({
      failed: 0,
      requeued: 0,
      timedOut: 0,
    });
    expect(calls.filter((call) => call.startsWith("terminate"))).toEqual([]);
    expect(events).toEqual([]);
    expect((await jobRow(running.id))?.status).toBe("running");
  });

  it("logs a job whose port call fails and goes on with the others", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const broken = await job("queued", new Date(OLD_QUEUED.getTime() - 1000));
    const lost = await job("queued", OLD_QUEUED);
    const { port } = fakePort({});
    const { status } = port;
    port.status = (id) =>
      id === broken.id ? Promise.reject(new Error("engine down")) : status(id);
    const { events, queues } = recordingQueues();

    expect(await run(port, queues)).toMatchObject({ requeued: 1 });
    expect(events).toEqual([
      { renderJobId: lost.id, type: "render.requested" },
    ]);
    expect(error).toHaveBeenCalledWith(
      `[sponsorships] Failed to reconcile render job ${broken.id}; the next run retries:`,
      expect.any(Error)
    );
    error.mockRestore();
  });

  it("looks at most 25 queued jobs per run, oldest first", async () => {
    const jobs: { id: string; sponsorshipId: string }[] = [];
    for (let i = 0; i < RENDER_WATCHDOG_BUDGET + 2; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: fixtures, in order.
      jobs.push(await job("queued", new Date(OLD_QUEUED.getTime() - i * 1000)));
    }
    const { events, queues } = recordingQueues();
    expect(await run(null, queues)).toMatchObject({
      requeued: RENDER_WATCHDOG_BUDGET,
    });
    const sent = new Set(
      events.map((event) =>
        event.type === "render.requested" ? event.renderJobId : null
      )
    );
    // The two newest wait for the next run.
    expect(sent.has(jobs[0]?.id as string)).toBe(false);
    expect(sent.has(jobs[1]?.id as string)).toBe(false);
    expect(sent.has(jobs.at(-1)?.id as string)).toBe(true);
  });

  it("gives running jobs their own budget: old queued jobs cannot starve them", async () => {
    for (let i = 0; i < RENDER_WATCHDOG_BUDGET + 1; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: fixtures, in order.
      await job("queued", new Date(PAST_CEILING.getTime() - (i + 1) * 1000));
    }
    // The newest job of all, and running: still looked at this run.
    const running = await job("running", RECENT);
    const { port } = fakePort({ [running.id]: { status: "errored" } });
    const { queues } = recordingQueues();

    expect(await run(port, queues)).toEqual({
      failed: 1,
      requeued: RENDER_WATCHDOG_BUDGET,
      timedOut: 0,
    });
    expect((await jobRow(running.id))?.status).toBe("failed");
  });

  it("summarises an instance error without URLs", () => {
    expect(
      instanceErrorSummary({
        error: { message: "PUT https://storage.mux.com/up?sig=1 failed" },
        status: "errored",
      })
    ).toBe("workflow errored: PUT [url] failed");
    expect(instanceErrorSummary({ status: "terminated" })).toBe(
      "workflow terminated"
    );
  });

  it.each([
    ["queued", OLD_QUEUED],
    ["running", null],
  ] as const)(
    "seeks render_job_status_updated_idx for %s (migration 0011)",
    async (status, before) => {
      const { params, sql } = watchdogQuery(db, status, before).toSQL();
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(...params)
        .all<{ detail: string }>();
      const details = plan.results.map((row) => row.detail);
      expect(
        details.some(
          (d) =>
            d.startsWith("SEARCH render_job USING INDEX") &&
            d.includes("render_job_status_updated_idx")
        )
      ).toBe(true);
      expect(details.some((d) => d.includes("TEMP B-TREE"))).toBe(false);
    }
  );
});

describe("runStaleSweep runs the render watchdog", () => {
  it("after the payment reconciliation, counted in its result", async () => {
    const queued = await job("queued", OLD_QUEUED);
    const running = await job("running", RECENT);
    const { port } = fakePort({ [running.id]: { status: "errored" } });
    const { events, queues } = recordingQueues();

    const result = await runStaleSweep({
      db,
      mollie: null,
      now: NOW,
      queues,
      siteUrl: SITE_URL,
      workflow: port,
    });

    expect(result).toMatchObject({
      renderFailed: 1,
      renderRequeued: 1,
      renderTimedOut: 0,
    });
    expect(events).toContainEqual({
      renderJobId: queued.id,
      type: "render.requested",
    });
    expect((await jobRow(running.id))?.status).toBe("failed");
  });
});
