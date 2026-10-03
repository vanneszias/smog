/**
 * Sponsorship fixtures for the site tests: a real checkout (the
 * `sponsorships.checkout` procedure against the Mollie fake and this
 * Worker's D1 and R2), queue bindings that record what they are sent, and
 * reads of the resulting rows (plain D1 SQL).
 */
import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import type { Gesture } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeGesture } from "@smog/db/testing";
import { FAKE_MOLLIE_API_KEY, type FakeMollie } from "@smog/payments/testing";
import { makeRpcContext } from "@smog/rpc/testing";
import { createSponsorshipsRouter } from "@smog/sponsorships/server";

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
  options: { count?: number; email?: string; gestures?: Gesture[] } = {}
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
      expectedTotalCents: gestures.length * 5000,
      gestureIds: gestures.map((g) => g.id),
      locale: "nl",
    },
    {
      context: makeRpcContext({
        db,
        env: { MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY },
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
