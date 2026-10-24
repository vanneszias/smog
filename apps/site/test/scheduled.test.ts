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
  deadLetter,
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
    expect(mail[0]?.text).toContain("/sponsor/renew#token=");
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

  it(`retention (${CRON.retention}) removes an old drawing object nothing references and keeps a recorded one`, async () => {
    const owner = await makeGesture(db);
    const recorded = `teacher/drawings/${owner.id}/1/${newId()}`;
    const orphan = `teacher/drawings/${owner.id}/2/${newId()}`;
    await media.put(recorded, new Uint8Array([1, 2, 3]));
    await media.put(orphan, new Uint8Array([1, 2, 3]));
    await d1
      .prepare(
        "INSERT INTO gesture_drawing (gesture_id, step, r2_key, content_type, size, width, height, credit, updated_at) VALUES (?, 1, ?, 'image/png', 3, 8, 8, '', 1)"
      )
      .bind(owner.id, recorded)
      .run();
    // Uploaded now: a run a day and a minute later sweeps the orphan only.
    const later = new Date(Date.now() + DAY_MS + 60_000);

    const first = await runCron("retention", later);
    const second = await runCron("retention", later);

    expect(await media.head(orphan)).toBeNull();
    expect(await media.head(recorded)).not.toBeNull();
    expect(counts(first).drawingsDeleted).toBeGreaterThanOrEqual(1);
    expect(counts(second).drawingsDeleted).toBe(0);
    await d1
      .prepare("DELETE FROM gesture_drawing WHERE gesture_id = ?")
      .bind(owner.id)
      .run();
    await media.delete(recorded);
  });

  it(`retention (${CRON.retention}) purges dead letters older than 14 days and keeps the rest`, async () => {
    const later = new Date(Date.now() + DAY_MS + 60_000);
    const row = (id: string, receivedAt: Date) => ({
      attempts: 6,
      body: null,
      id,
      originQueue: "email" as const,
      queue: "smog-dev-email-dlq",
      receivedAt,
      replayable: false,
      type: "auth/otp",
    });
    const old = newId();
    const kept = newId();
    await db
      .insert(deadLetter)
      .values([
        row(old, new Date(later.getTime() - 14 * DAY_MS - 1)),
        row(kept, new Date(later.getTime() - 14 * DAY_MS + 1)),
      ]);

    const first = await runCron("retention", later);
    const second = await runCron("retention", later);

    const ids = (await db.select({ id: deadLetter.id }).from(deadLetter)).map(
      (entry) => entry.id
    );
    expect(ids).not.toContain(old);
    expect(ids).toContain(kept);
    expect(counts(first).dead_letter).toBeGreaterThanOrEqual(1);
    expect(counts(second).dead_letter).toBe(0);
  });

  it(`retention (${CRON.retention}) sends the dead-letter digest to the admins once a day, with counts and types only`, async () => {
    const adminEmail = `${newId()}@smog.test`;
    await d1
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, role, locale, created_at, updated_at) VALUES (?, 'Ada Admin', ?, 1, 'admin', 'en', 1, 1)"
      )
      .bind(newId(), adminEmail)
      .run();
    // A day nobody else used: the marker is per UTC day.
    const day = new Date(Date.now() + 3 * DAY_MS);
    await d1
      .prepare(
        "INSERT INTO dead_letter (id, queue, origin_queue, type, attempts, received_at, body, replayable) VALUES (?, 'smog-dev-email-dlq', 'email', 'transactional/welcome', 6, ?, ?, 1)"
      )
      .bind(
        newId(),
        day.getTime() - 1000,
        JSON.stringify({ to: "stored.recipient@smog.test" })
      )
      .run();

    const first = await runCron("retention", day);
    const second = await runCron("retention", day);

    expect(counts(first).digestSent).toBeGreaterThanOrEqual(1);
    expect(counts(second).digestSent).toBe(0);
    const mail = await waitForMail(adminEmail);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.subject).toBe("Dead letters need attention");
    // Counts and types: nothing of the stored message.
    expect(mail[0]?.text).not.toContain("stored.recipient");
    expect(mail[0]?.text).toContain("transactional/welcome");
    expect(
      await env.KV?.get(`dlq-digest:${day.toISOString().slice(0, 10)}`)
    ).toBe("1");
  });

  it(`stale (${CRON.stale}) moves rendering and render_failed sponsorships to in_review, once, with a trail event (phase 10b task 9)`, async () => {
    const rendering = await seed({ status: "rendering" });
    const failed = await seed({ status: "render_failed" });
    const jobId = newId();
    await db.insert(renderJob).values({
      createdAt: new Date(NOW.getTime() - 11 * 60_000),
      id: jobId,
      input: { v: 1 },
      sponsorshipId: rendering.id,
      status: "queued",
      updatedAt: new Date(NOW.getTime() - 11 * 60_000),
      workflowInstanceId: jobId,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const first = await runCron("stale");
    const second = await runCron("stale");

    expect(counts(first)).toMatchObject({ retireFailed: 0 });
    expect(counts(first).retired).toBeGreaterThanOrEqual(2);
    expect(counts(second)).toMatchObject({ retired: 0 });
    expect(await statusOf(rendering.id)).toBe("in_review");
    expect(await statusOf(failed.id)).toBe("in_review");
    expect(await eventTypes(rendering.id)).toEqual(["render_succeeded"]);
    const job = await d1
      .prepare("SELECT status, error FROM render_job WHERE id = ?")
      .bind(jobId)
      .first<{ error: string; status: string }>();
    expect(job).toEqual({ error: "render pipeline retired", status: "failed" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("from a retired render state to in_review")
    );
  });

  it("logs a cron it does not know and does not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const controller = createScheduledController({ cron: "0 3 1 * *" });

    await worker.scheduled(controller, env, createExecutionContext());

    expect(warn).toHaveBeenCalledWith("[cron] Unknown schedule 0 3 1 * *");
  });
});
