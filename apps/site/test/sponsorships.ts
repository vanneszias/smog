/**
 * Sponsorship fixtures for the site tests: a real checkout (the
 * `sponsorships.checkout` procedure against the Mollie fake and this
 * Worker's D1 and R2), queue bindings that record what they are sent, and
 * reads of the resulting rows (plain D1 SQL).
 */
import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { type Gesture, sponsor, sponsorship } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeGesture } from "@smog/db/testing";
import type { RenderStarter } from "@smog/jobs";
import { FAKE_MOLLIE_API_KEY, type FakeMollie } from "@smog/payments/testing";
import { type RenderInput, renderInputSchema } from "@smog/render/contract";
import { makeRpcContext } from "@smog/rpc/testing";
import {
  createRenderJob,
  createSponsorshipsRouter,
} from "@smog/sponsorships/server";

function d1(): D1Database {
  if (!env.DB) {
    throw new Error("[test] The DB binding is missing");
  }
  return env.DB;
}

export function kv(): KVNamespace {
  if (!env.KV) {
    throw new Error("[test] The KV binding is missing");
  }
  return env.KV;
}

export function testDb(): Db {
  return createDb(d1());
}

/**
 * A starter that leaves the job `queued`, as a Workflow instance that has
 * not run yet would (the render tests drive the real one).
 */
export function leaveQueued(): RenderStarter {
  return { start: () => Promise.resolve() };
}

export interface RecordingQueue {
  readonly messages: unknown[];
  send: (body: unknown) => Promise<void>;
}

/** A queue binding that records each message (or fails every send). */
export function recordingQueue({ fail = false } = {}): RecordingQueue {
  const messages: unknown[] = [];
  return {
    messages,
    send: (body) => {
      if (fail) {
        return Promise.reject(new Error("[test] The queue is down"));
      }
      messages.push(body);
      return Promise.resolve();
    },
  };
}

export interface CheckedOut {
  gestures: Gesture[];
  mollieId: string;
  paymentId: string;
  sponsorshipIds: string[];
}

async function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await d1()
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return results;
}

/** A checkout of `count` new gestures (or `gestures`), as the wizard makes it. */
export async function checkoutVia(
  fake: FakeMollie,
  options: {
    count?: number;
    email?: string;
    gestures?: Gesture[];
    logoKey?: string;
  } = {}
): Promise<CheckedOut> {
  const db = testDb();
  const gestures =
    options.gestures ??
    (await Promise.all(
      Array.from({ length: options.count ?? 2 }, (_, i) =>
        makeGesture(db, { name: `Gebaar ${i + 1} ${crypto.randomUUID()}` })
      )
    ));
  const router = createSponsorshipsRouter({ mollieFetch: fake.fetch });
  const checkoutId = crypto.randomUUID();
  await call(
    router.checkout,
    {
      checkoutId,
      contact: {
        email: options.email ?? `${crypto.randomUUID()}@smog.test`,
        name: "Alex Sponsor",
      },
      displayName: "Acme BV",
      expectedTotalCents: gestures.length * (options.logoKey ? 6000 : 5000),
      gestureIds: gestures.map((g) => g.id),
      locale: "nl",
      ...(options.logoKey ? { logoKey: options.logoKey } : {}),
    },
    {
      context: makeRpcContext({
        db,
        env: { MEDIA: env.MEDIA, MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY },
        kv: kv(),
      }),
      path: ["sponsorships", "checkout"],
    }
  );
  const items = await all<{ sponsorship_id: string }>(
    "SELECT sponsorship_id FROM payment_item WHERE payment_id = ? ORDER BY sponsorship_id",
    checkoutId
  );
  const created = [...fake.payments.values()].find(
    (p) => (p.metadata as { paymentId?: string }).paymentId === checkoutId
  );
  if (!created) {
    throw new Error("[test] The checkout created no Mollie payment");
  }
  return {
    gestures,
    mollieId: created.id,
    paymentId: checkoutId,
    sponsorshipIds: items.map((item) => item.sponsorship_id),
  };
}

export async function logoKeysOf(sponsorshipIds: readonly string[]) {
  const rows = await all<{ logo_key: string | null }>(
    "SELECT logo_key FROM sponsorship WHERE id IN (SELECT value FROM json_each(?))",
    JSON.stringify(sponsorshipIds)
  );
  return rows.map((row) => row.logo_key);
}

export async function paymentStatusOf(paymentId: string): Promise<string> {
  const [row] = await all<{ status: string }>(
    "SELECT status FROM payment WHERE id = ?",
    paymentId
  );
  return row?.status ?? "missing";
}

export async function statusesOf(ids: readonly string[]) {
  const rows = await all<{ id: string; status: string }>(
    "SELECT id, status FROM sponsorship WHERE id IN (SELECT value FROM json_each(?))",
    JSON.stringify(ids)
  );
  return ids.map((id) => rows.find((row) => row.id === id)?.status);
}

export async function trailTypes(sponsorshipId: string): Promise<string[]> {
  const rows = await all<{ type: string }>(
    "SELECT type FROM sponsorship_event WHERE sponsorship_id = ? ORDER BY created_at, rowid",
    sponsorshipId
  );
  return rows.map((row) => row.type);
}

export async function jobsOf(sponsorshipIds: readonly string[]) {
  const rows = await all<{
    id: string;
    sponsorship_id: string;
    status: string;
  }>(
    "SELECT id, sponsorship_id, status FROM render_job WHERE sponsorship_id IN (SELECT value FROM json_each(?)) ORDER BY sponsorship_id",
    JSON.stringify(sponsorshipIds)
  );
  return rows.map((row) => ({
    id: row.id,
    sponsorshipId: row.sponsorship_id,
    status: row.status,
  }));
}

/** An admin who gets the admin emails (verified, no ban). */
export async function makeAdmin() {
  const id = crypto.randomUUID();
  const email = `${id}@smog.test`;
  await d1()
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, role, locale, created_at, updated_at) VALUES (?, 'Ada Admin', ?, 1, 'admin', 'nl', ?, ?)"
    )
    .bind(id, email, Date.now(), Date.now())
    .run();
  return { email, id };
}

/**
 * A `rendering` sponsorship (inserted directly) with its `queued` render
 * job, as `payment.settled` leaves it (phase 7: the render Workflow tests).
 */
export async function renderingJob(): Promise<{
  gesture: Gesture;
  input: RenderInput;
  renderJobId: string;
  sponsorshipId: string;
}> {
  const db = testDb();
  const gesture = await makeGesture(db, {
    name: `Gebaar ${crypto.randomUUID()}`,
  });
  const sponsorId = crypto.randomUUID();
  const sponsorshipId = crypto.randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(sponsor).values({
      createdAt: now,
      email: `${sponsorId}@smog.test`,
      id: sponsorId,
      locale: "nl",
      name: "Alex Sponsor",
    }),
    db.insert(sponsorship).values({
      createdAt: now,
      displayName: "Acme BV",
      gestureId: gesture.id,
      id: sponsorshipId,
      logoKey: null,
      sponsorId,
      status: "rendering",
      updatedAt: now,
    }),
  ]);
  const job = await createRenderJob(db, { now, sponsorshipId });
  if (!job) {
    throw new Error("[test] No render job created");
  }
  const [row] = await all<{ input: string }>(
    "SELECT input FROM render_job WHERE id = ?",
    job.renderJobId
  );
  return {
    gesture,
    input: renderInputSchema.parse(JSON.parse(row?.input ?? "null")),
    renderJobId: job.renderJobId,
    sponsorshipId,
  };
}

/** One render job's row (plain D1 SQL). */
export async function renderJobRow(renderJobId: string) {
  const [row] = await all<{
    error: string | null;
    mux_asset_id: string | null;
    mux_upload_id: string | null;
    playback_id: string | null;
    status: string;
  }>(
    "SELECT status, error, mux_upload_id, mux_asset_id, playback_id FROM render_job WHERE id = ?",
    renderJobId
  );
  return row;
}

/** One sponsorship's status and video (plain D1 SQL). */
export async function sponsorshipVideo(sponsorshipId: string) {
  const [row] = await all<{
    status: string;
    video_asset_id: string | null;
    video_playback_id: string | null;
  }>(
    "SELECT status, video_asset_id, video_playback_id FROM sponsorship WHERE id = ?",
    sponsorshipId
  );
  return row;
}
