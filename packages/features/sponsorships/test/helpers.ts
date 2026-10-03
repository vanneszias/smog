/**
 * Fixtures for the sponsorship D1 tests: rows are inserted directly (a
 * fixture may start in any state; only updates go through the state
 * machine), and the Mollie fake stands in for Mollie.
 */
import { env } from "cloudflare:workers";
import { type AnyProcedure, call } from "@orpc/server";
import {
  type Gesture,
  type PaymentKind,
  type PaymentStatus,
  payment,
  paymentItem,
  type SponsorshipStatus,
  sponsor,
  sponsorship,
  sponsorshipEvent,
  user,
} from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeGesture } from "@smog/db/testing";
import { createPayment, getPayment, type MolliePayment } from "@smog/payments";
import { FAKE_MOLLIE_API_KEY, type FakeMollie } from "@smog/payments/testing";
import { makeRpcContext } from "@smog/rpc/testing";
import { DAY_MS, newId } from "@smog/utils";
import { asc, eq, sql } from "drizzle-orm";
import { createSponsorshipsRouter } from "../src/server/router";

export const SITE_URL = "http://localhost:5173";
export const NOW = new Date("2026-10-03T10:00:00.000Z");

export function testDb(): Db {
  return createDb(env.DB);
}

export interface SeedOptions {
  amountCents?: number;
  count?: number;
  endsAt?: Date | null;
  /** The gestures to sponsor (made when left out). */
  gestures?: Gesture[];
  kind?: PaymentKind;
  logo?: boolean;
  mollieId?: string | null;
  paymentStatus?: PaymentStatus;
  status?: SponsorshipStatus;
  videoPlaybackId?: string | null;
}

export interface Seeded {
  gestures: Gesture[];
  paymentId: string;
  sponsorId: string;
  sponsorshipIds: string[];
}

/** A checkout: a sponsor, n sponsorships, one payment and its items. */
export async function seedCheckout(
  db: Db,
  options: SeedOptions = {}
): Promise<Seeded> {
  const count = options.gestures?.length ?? options.count ?? 2;
  const gestures =
    options.gestures ??
    (await Promise.all(
      Array.from({ length: count }, (_, i) =>
        makeGesture(db, { name: `Gebaar ${i + 1}` })
      )
    ));
  const logo = options.logo ?? false;
  const perItem = logo ? 6000 : 5000;
  const sponsorId = newId();
  const paymentId = newId();
  const sponsorshipIds = gestures.map(() => newId());
  const status = options.status ?? "awaiting_payment";
  const created = new Date(NOW.getTime() - DAY_MS);
  const [first, ...rest] = [
    db.insert(sponsor).values({
      createdAt: created,
      email: `${sponsorId}@example.com`,
      id: sponsorId,
      locale: "nl",
      name: "Alex Sponsor",
    }),
    ...gestures.map((gesture, i) =>
      db.insert(sponsorship).values({
        createdAt: created,
        displayName: "Acme BV",
        endsAt: options.endsAt ?? null,
        gestureId: gesture.id,
        id: sponsorshipIds[i] as string,
        logoKey: logo ? `logos/${newId()}` : null,
        sponsorId,
        startsAt:
          options.endsAt === undefined || options.endsAt === null
            ? null
            : new Date(options.endsAt.getTime() - 365 * DAY_MS),
        status,
        updatedAt: created,
        videoPlaybackId: options.videoPlaybackId ?? null,
      })
    ),
    db.insert(payment).values({
      amountCents: options.amountCents ?? perItem * gestures.length,
      createdAt: created,
      id: paymentId,
      kind: options.kind ?? "initial",
      mollieId: options.mollieId ?? null,
      status: options.paymentStatus ?? "open",
      updatedAt: created,
    }),
    ...sponsorshipIds.map((sponsorshipId) =>
      db.insert(paymentItem).values({
        amountCents: perItem,
        includesLogo: logo,
        paymentId,
        sponsorshipId,
      })
    ),
  ];
  if (first) {
    await db.batch([first, ...rest]);
  }
  return { gestures, paymentId, sponsorId, sponsorshipIds };
}

/**
 * A renewal payment for an existing sponsorship (`live` or `expiring`),
 * one item at the sponsorship's price.
 */
export async function seedRenewalPayment(
  db: Db,
  sponsorshipId: string,
  options: {
    amountCents?: number;
    mollieId?: string;
    status?: PaymentStatus;
  } = {}
): Promise<string> {
  const paymentId = newId();
  await db.batch([
    db.insert(payment).values({
      amountCents: options.amountCents ?? 5000,
      id: paymentId,
      kind: "renewal",
      mollieId: options.mollieId ?? null,
      status: options.status ?? "open",
    }),
    db.insert(paymentItem).values({
      amountCents: options.amountCents ?? 5000,
      includesLogo: false,
      paymentId,
      sponsorshipId,
    }),
  ]);
  return paymentId;
}

export async function statusOf(
  db: Db,
  sponsorshipId: string
): Promise<SponsorshipStatus | undefined> {
  const row = await db.query.sponsorship.findFirst({
    where: (table, { eq: equals }) => equals(table.id, sponsorshipId),
  });
  return row?.status;
}

export async function sponsorshipRow(db: Db, sponsorshipId: string) {
  const row = await db.query.sponsorship.findFirst({
    where: (table, { eq: equals }) => equals(table.id, sponsorshipId),
  });
  if (!row) {
    throw new Error(`[test] No sponsorship ${sponsorshipId}`);
  }
  return row;
}

export async function paymentRow(db: Db, paymentId: string) {
  const row = await db.query.payment.findFirst({
    where: (table, { eq: equals }) => equals(table.id, paymentId),
  });
  if (!row) {
    throw new Error(`[test] No payment ${paymentId}`);
  }
  return row;
}

/** The trail of a sponsorship, oldest first. */
export async function eventsOf(db: Db, sponsorshipId: string) {
  return await db
    .select()
    .from(sponsorshipEvent)
    .where(eq(sponsorshipEvent.sponsorshipId, sponsorshipId))
    // Insertion order within one timestamp (one batch shares `now`).
    .orderBy(asc(sponsorshipEvent.createdAt), asc(sql`rowid`));
}

/** Each sponsorship's status and trail, in the order asked. */
export async function trailsOf(db: Db, sponsorshipIds: readonly string[]) {
  return await Promise.all(
    sponsorshipIds.map(async (id) => ({
      events: await eventsOf(db, id),
      status: await statusOf(db, id),
    }))
  );
}

/** Every admin who gets the admin emails (verified, no ban). */
export async function makeAdmin(
  db: Db,
  overrides: Partial<typeof user.$inferInsert> = {}
) {
  const id = newId();
  const [row] = await db
    .insert(user)
    .values({
      email: `${id}@smog.test`,
      emailVerified: true,
      id,
      locale: "fr",
      name: "Ada Admin",
      role: "admin",
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("[test] Failed to insert an admin");
  }
  return row;
}

/**
 * A Mollie payment at the fake for our payment, and our row pointing at
 * it (as `startMolliePayment` leaves it).
 */
export async function molliePaymentFor(
  db: Db,
  fake: FakeMollie,
  paymentId: string,
  amountCents: number,
  kind: PaymentKind = "initial"
): Promise<string> {
  const created = await createPayment(fake.mollie, {
    amountCents,
    description: "Sponsoring",
    idempotencyKey: paymentId,
    locale: "nl",
    metadata: { kind, paymentId },
    redirectUrl: `${SITE_URL}/sponsor/success?payment=${paymentId}`,
  });
  await db
    .update(payment)
    .set({ checkoutUrl: created.checkoutUrl, mollieId: created.id })
    .where(eq(payment.id, paymentId));
  return created.id;
}

/** Mollie's current view of a payment (what the webhook re-fetches). */
export async function refetch(
  fake: FakeMollie,
  mollieId: string
): Promise<MolliePayment> {
  const fetched = await getPayment(fake.mollie, mollieId);
  if (!fetched) {
    throw new Error(`[test] The fake does not know ${mollieId}`);
  }
  return fetched;
}

const router = createSponsorshipsRouter();

/** The router's procedure at `path` (relative to `sponsorships`). */
function procedureAt(path: string): AnyProcedure {
  let node: unknown = router;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)[key];
  }
  if (!node) {
    throw new Error(`[test] No sponsorships procedure at ${path}`);
  }
  return node as AnyProcedure;
}

/** Calls `sponsorships.<path>` as `/api/rpc` routes it (the guards read the path). */
export async function callAt<T = unknown>(
  path: string,
  input: unknown,
  overrides: Parameters<typeof makeRpcContext>[0] = {}
): Promise<T> {
  return (await call(procedureAt(path), input, {
    context: makeRpcContext({
      db: testDb(),
      kv: env.KV,
      ...overrides,
      env: { MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY, ...overrides.env },
    }),
    path: ["sponsorships", ...path.split(".")],
  })) as T;
}
