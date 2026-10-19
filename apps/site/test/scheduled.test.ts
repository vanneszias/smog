/**
 * The Cron Triggers through the Worker's `scheduled()` (phase 6 ruling 9):
 * each schedule of `CRON` runs its sweep with the dev bindings (no Mollie
 * key and no Mux credentials, as staging today), twice, for one effect.
 */
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  auditLog,
  payment,
  paymentItem,
  renderJob,
  sponsor,
  sponsorship,
} from "@smog/db";
import { createDb } from "@smog/db/client";
import { makeGesture } from "@smog/db/testing";
import { CRON, type CronName } from "@smog/jobs";
import { DAY_MS, newId } from "@smog/utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker";
import {
  type WorkflowStatusBinding,
  workflowStatusPort,
} from "../src/worker/scheduled";
import { waitForMail } from "./helpers";

function required<T>(binding: T | undefined, name: string): T {
  if (!binding) {
    throw new Error(`[test] The ${name} binding is missing`);
  }
  return binding;
}

const d1 = required(env.DB, "DB");
const db = createDb(d1);
const media = required(env.MEDIA, "MEDIA");
const NOW = new Date("2026-10-03T08:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
});

async function runCron(name: CronName, now = NOW): Promise<string[]> {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const ctx = createExecutionContext();
  await worker.scheduled(
    createScheduledController({ cron: CRON[name], scheduledTime: now }),
    env,
    ctx
  );
  await waitOnExecutionContext(ctx);
  const lines = log.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.startsWith(`[cron] ${name} `));
  log.mockRestore();
  return lines;
}

/** The counts the handler logged (`[cron] <name> {…}`). */
function counts(lines: string[]): Record<string, number> {
  const [line] = lines;
  return JSON.parse(line?.slice(line.indexOf("{")) ?? "{}");
}

/** One sponsorship with its sponsor and an initial payment. */
async function seed(fields: {
  endsAt?: Date | null;
  paymentCreatedAt?: Date;
  paymentStatus?: "open" | "paid";
  status: typeof sponsorship.$inferInsert.status;
}) {
  const gesture = await makeGesture(db);
  const sponsorId = newId();
  const id = newId();
  const paymentId = newId();
  const email = `${sponsorId}@example.com`;
  await db.batch([
    db.insert(sponsor).values({
      email,
      id: sponsorId,
      locale: "nl",
      name: "Alex Sponsor",
    }),
    db.insert(sponsorship).values({
      displayName: "Acme BV",
      endsAt: fields.endsAt ?? null,
      gestureId: gesture.id,
      id,
      sponsorId,
      startsAt: fields.endsAt
        ? new Date(fields.endsAt.getTime() - 365 * DAY_MS)
        : null,
      status: fields.status,
    }),
    db.insert(payment).values({
      amountCents: 5000,
      createdAt:
        fields.paymentCreatedAt ?? new Date(NOW.getTime() - 400 * DAY_MS),
      id: paymentId,
      kind: "initial",
      status: fields.paymentStatus ?? "paid",
    }),
    db.insert(paymentItem).values({
      amountCents: 5000,
      includesLogo: false,
      paymentId,
      sponsorshipId: id,
    }),
  ]);
  return { email, id, paymentId };
}

async function statusOf(id: string) {
  const row = await d1
    .prepare("SELECT status FROM sponsorship WHERE id = ?")
    .bind(id)
    .first<{ status: string }>();
  return row?.status;
}

async function paymentStatusOf(id: string) {
  const row = await d1
    .prepare("SELECT status FROM payment WHERE id = ?")
    .bind(id)
    .first<{ status: string }>();
  return row?.status;
}

/** The trail, in insertion order. */
async function eventTypes(id: string) {
  const { results } = await d1
    .prepare(
      "SELECT type FROM sponsorship_event WHERE sponsorship_id = ? ORDER BY created_at, rowid"
    )
    .bind(id)
    .all<{ type: string }>();
  return results.map((row) => row.type);
}

describe("the scheduled dispatch (ruling 9)", () => {
  it(`expiry (${CRON.expiry}) expires a sponsorship past its end, once`, async () => {
    const { id } = await seed({
      endsAt: new Date(NOW.getTime() - 1),
      status: "live",
    });

    const first = await runCron("expiry");
    const second = await runCron("expiry");

    expect(await statusOf(id)).toBe("expired");
    expect(await eventTypes(id)).toEqual(["expired"]);
    expect(counts(first).expired).toBeGreaterThanOrEqual(1);
    expect(counts(second)).toMatchObject({ expired: 0, failed: 0 });
  });

  it(`reminders (${CRON.reminders}) emails the sponsor once through the email queue`, async () => {
    const { email, id } = await seed({
      endsAt: new Date(NOW.getTime() + 20 * DAY_MS),
      status: "live",
    });

    const first = await runCron("reminders");
    const second = await runCron("reminders");

    expect(await statusOf(id)).toBe("expiring");
    expect(await eventTypes(id)).toEqual(["token_issued", "reminder_sent"]);
    expect(counts(first).reminded).toBeGreaterThanOrEqual(1);
    expect(counts(second)).toMatchObject({ failed: 0, reminded: 0 });
    const mail = await waitForMail(email);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.text).toContain("/sponsor/renew?token=");
  });

  it(`stale (${CRON.stale}) cancels an open payment older than 24 h locally without a Mollie key`, async () => {
    const { id, paymentId } = await seed({
      paymentCreatedAt: new Date(NOW.getTime() - DAY_MS - 1),
      paymentStatus: "open",
      status: "awaiting_payment",
    });
    const fresh = await seed({
      paymentCreatedAt: new Date(NOW.getTime() - DAY_MS + 60_000),
      paymentStatus: "open",
      status: "awaiting_payment",
    });

    const first = await runCron("stale");
    const second = await runCron("stale");

    expect(await paymentStatusOf(paymentId)).toBe("canceled");
    expect(await statusOf(id)).toBe("cancelled");
    expect(await eventTypes(id)).toEqual(["cancelled"]);
    expect(await statusOf(fresh.id)).toBe("awaiting_payment");
    expect(counts(first).cancelled).toBeGreaterThanOrEqual(1);
    expect(counts(second)).toMatchObject({ cancelled: 0, failed: 0 });
  });

  it(`retention (${CRON.retention}) purges an audit entry older than 3 years and an old orphan logo`, async () => {
    const orphan = `logos/${newId()}`;
    await media.put(orphan, new Uint8Array([1, 2, 3]));
    // The logo was uploaded now: a run a day and a minute later deletes it.
    const later = new Date(Date.now() + DAY_MS + 60_000);
    const old = newId();
    const kept = newId();
    await db.insert(auditLog).values([
      {
        action: "gesture.update",
        createdAt: new Date(later.getTime() - 3 * 365 * DAY_MS - 1),
        data: {},
        id: old,
        targetId: "g",
        targetType: "gesture",
      },
      {
        action: "gesture.update",
        createdAt: new Date(later.getTime() - 3 * 365 * DAY_MS + 1),
        data: {},
        id: kept,
        targetId: "g",
        targetType: "gesture",
      },
    ]);

    const first = await runCron("retention", later);
    const second = await runCron("retention", later);

    const ids = (await db.select({ id: auditLog.id }).from(auditLog)).map(
      (row) => row.id
    );
    expect(ids).not.toContain(old);
    expect(ids).toContain(kept);
    expect(await media.head(orphan)).toBeNull();
    expect(counts(first).logosDeleted).toBeGreaterThanOrEqual(1);
    expect(counts(second)).toMatchObject({ audit_log: 0, logosDeleted: 0 });
    expect(counts(first).audit_log).toBeGreaterThanOrEqual(1);
  });

  it(`stale (${CRON.stale}) re-sends render.requested for a job queued over 10 minutes, once (fake mode: no Workflow binding)`, async () => {
    const { id } = await seed({ status: "rendering" });
    const jobId = newId();
    await db.insert(renderJob).values({
      createdAt: new Date(NOW.getTime() - 11 * 60_000),
      id: jobId,
      input: { v: 1 },
      sponsorshipId: id,
      status: "queued",
      updatedAt: new Date(NOW.getTime() - 11 * 60_000),
      workflowInstanceId: jobId,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const first = await runCron("stale");
    const second = await runCron("stale");

    expect(counts(first)).toMatchObject({
      renderFailed: 0,
      renderRequeued: 1,
      renderTimedOut: 0,
    });
    expect(counts(second)).toMatchObject({ renderRequeued: 0 });
    expect(warn).toHaveBeenCalledWith(
      `[sponsorships] Re-sent render.requested for the queued render job ${jobId}`
    );
  });

  it("logs a cron it does not know and does not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const controller = createScheduledController({ cron: "0 3 1 * *" });

    await worker.scheduled(controller, env, createExecutionContext());

    expect(warn).toHaveBeenCalledWith("[cron] Unknown schedule 0 3 1 * *");
  });
});

describe("workflowStatusPort (the render watchdog's port, ruling 12)", () => {
  it("is null without a RENDER_WORKFLOW binding", () => {
    expect(workflowStatusPort(undefined)).toBeNull();
  });

  it("answers an instance's status, not-found for an unknown id, and terminates", async () => {
    const terminated: string[] = [];
    const binding: WorkflowStatusBinding = {
      get: (id) => {
        if (id === "gone") {
          return Promise.reject(new Error("instance.not_found"));
        }
        if (id === "broken") {
          return Promise.reject(new Error("engine unavailable"));
        }
        return Promise.resolve({
          status: () =>
            Promise.resolve(
              id === "failed"
                ? {
                    error: { message: "boom", name: "Error" },
                    status: "errored" as const,
                  }
                : { status: "running" as const }
            ),
          terminate: () => {
            terminated.push(id);
            return Promise.resolve();
          },
        });
      },
    };
    const port = workflowStatusPort(binding);
    expect(await port?.status("job-1")).toEqual({
      error: null,
      status: "running",
    });
    expect(await port?.status("failed")).toEqual({
      error: { message: "boom", name: "Error" },
      status: "errored",
    });
    expect(await port?.status("gone")).toBe("not-found");
    await expect(port?.status("broken")).rejects.toThrow("engine unavailable");
    await port?.terminate("job-1");
    expect(terminated).toEqual(["job-1"]);
  });

  it("only the instance.not_found code is not-found; any other 'not found' is thrown (review I-1)", async () => {
    const failing = (message: string): WorkflowStatusBinding => ({
      get: () => Promise.reject(new Error(message)),
    });
    for (const message of [
      "instance.not_found",
      "(instance.not_found) Instance does not exist",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one case at a time.
      expect(await workflowStatusPort(failing(message))?.status("x")).toBe(
        "not-found"
      );
    }
    for (const message of [
      "Workflow not found",
      "script not found",
      "Not Found",
      "instance.not_foundation",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one case at a time.
      await expect(
        workflowStatusPort(failing(message))?.status("x")
      ).rejects.toThrow(message);
    }
  });
});
