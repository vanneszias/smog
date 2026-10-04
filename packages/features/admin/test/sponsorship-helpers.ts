/**
 * Sponsorship fixtures for the admin tests: rows inserted directly (a
 * fixture may start in any state; only the procedures under test go
 * through the state machine), and the Mollie fake's payment for one.
 */
import { env } from "cloudflare:workers";
import {
  type Gesture,
  invoiceRequest,
  type PaymentKind,
  type PaymentStatus,
  payment,
  paymentItem,
  renderJob,
  type SponsorshipStatus,
  sponsor,
  sponsorship,
  sponsorshipToken,
} from "@smog/db";
import { makeGesture } from "@smog/db/testing";
import { createPayment } from "@smog/payments";
import { DAY_MS, newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { SITE_URL, testDb } from "./helpers";
import { testMollie } from "./sponsorship-fakes";

export interface SeedOptions {
  amountCents?: number;
  company?: string | null;
  count?: number;
  createdAt?: Date;
  displayName?: string;
  email?: string;
  endsAt?: Date | null;
  gestures?: Gesture[];
  invoice?: boolean;
  kind?: PaymentKind;
  logo?: boolean;
  /** Create the payment at the Mollie fake too (`mollie_id` set). */
  mollie?: boolean;
  paymentStatus?: PaymentStatus;
  startsAt?: Date | null;
  status?: SponsorshipStatus;
  videoAssetId?: string | null;
  videoPlaybackId?: string | null;
}

export interface Seeded {
  gestures: Gesture[];
  mollieId: string | null;
  paymentId: string;
  sponsorId: string;
  sponsorshipIds: string[];
}

/** A checkout: a sponsor, n sponsorships, one payment and its items. */
export async function seedCheckout(options: SeedOptions = {}): Promise<Seeded> {
  const db = testDb();
  const count = options.gestures?.length ?? options.count ?? 1;
  const gestures =
    options.gestures ??
    (await Promise.all(
      Array.from({ length: count }, () =>
        makeGesture(db, { name: `Gebaar ${newId().slice(0, 8)}` })
      )
    ));
  const logo = options.logo ?? false;
  const perItem = logo ? 6000 : 5000;
  const sponsorId = newId();
  const paymentId = newId();
  const sponsorshipIds = gestures.map(() => newId());
  const created = options.createdAt ?? new Date(Date.now() - DAY_MS);
  const amountCents = options.amountCents ?? perItem * gestures.length;
  const [first, ...rest] = [
    db.insert(sponsor).values({
      company: options.company === undefined ? "Acme BV" : options.company,
      createdAt: created,
      email: options.email ?? `${sponsorId}@example.com`,
      id: sponsorId,
      locale: "nl",
      name: "Alex Sponsor",
    }),
    ...(options.invoice
      ? [
          db.insert(invoiceRequest).values({
            email: "factuur@example.com",
            name: "Acme Facturatie",
            sponsorId,
            vatNumber: "0123456749",
          }),
        ]
      : []),
    ...gestures.map((gesture, i) =>
      db.insert(sponsorship).values({
        createdAt: created,
        displayName: options.displayName ?? "Acme BV",
        endsAt: options.endsAt ?? null,
        gestureId: gesture.id,
        id: sponsorshipIds[i] as string,
        logoKey: logo ? `logos/${crypto.randomUUID()}` : null,
        sponsorId,
        startsAt: options.startsAt ?? null,
        status: options.status ?? "awaiting_payment",
        updatedAt: created,
        videoAssetId: options.videoAssetId ?? null,
        videoPlaybackId: options.videoPlaybackId ?? null,
      })
    ),
    db.insert(payment).values({
      amountCents,
      createdAt: created,
      id: paymentId,
      kind: options.kind ?? "initial",
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
  let mollieId: string | null = null;
  if (options.mollie) {
    const atMollie = await createPayment(testMollie.mollie, {
      amountCents,
      description: "Sponsoring",
      idempotencyKey: paymentId,
      locale: "nl",
      metadata: { kind: options.kind ?? "initial", paymentId },
      redirectUrl: `${SITE_URL}/sponsor/success?payment=${paymentId}`,
    });
    mollieId = atMollie.id;
    await db
      .update(payment)
      .set({ checkoutUrl: atMollie.checkoutUrl, mollieId })
      .where(eq(payment.id, paymentId));
  }
  return { gestures, mollieId, paymentId, sponsorId, sponsorshipIds };
}

/** An open renewal payment of one sponsorship (`amountCents`, no Mollie). */
export async function seedRenewal(
  sponsorshipId: string,
  amountCents = 5000
): Promise<string> {
  const db = testDb();
  const paymentId = newId();
  await db.batch([
    db.insert(payment).values({
      amountCents,
      id: paymentId,
      kind: "renewal",
      status: "open",
    }),
    db.insert(paymentItem).values({
      amountCents,
      includesLogo: false,
      paymentId,
      sponsorshipId,
    }),
  ]);
  return paymentId;
}

/** An open token of `purpose` (its hash is random: no raw token exists). */
export async function seedToken(
  sponsorshipId: string,
  purpose: "reedit" | "renewal"
): Promise<string> {
  const id = newId();
  await testDb()
    .insert(sponsorshipToken)
    .values({
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
      id,
      purpose,
      sponsorshipId,
      tokenHash: newId().replaceAll("-", ""),
    });
  return id;
}

export async function sponsorshipRow(id: string) {
  const row = await testDb().query.sponsorship.findFirst({
    where: (table, { eq: equals }) => equals(table.id, id),
  });
  if (!row) {
    throw new Error(`[test] No sponsorship ${id}`);
  }
  return row;
}

export async function paymentRow(id: string) {
  const row = await testDb().query.payment.findFirst({
    where: (table, { eq: equals }) => equals(table.id, id),
  });
  if (!row) {
    throw new Error(`[test] No payment ${id}`);
  }
  return row;
}

/** The event types of a sponsorship's trail, oldest first. */
export async function eventTypes(sponsorshipId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT type FROM sponsorship_event WHERE sponsorship_id = ? ORDER BY created_at, rowid"
  )
    .bind(sponsorshipId)
    .all<{ type: string }>();
  return results.map((row) => row.type);
}

/**
 * A sponsorship whose first render failed: `render_failed`, paid, with a
 * `failed` render job (attempt 1).
 */
export async function seedRenderFailed(
  options: SeedOptions = {}
): Promise<Seeded & { renderJobId: string }> {
  const seeded = await seedCheckout({
    paymentStatus: "paid",
    status: "render_failed",
    ...options,
  });
  const renderJobId = newId();
  await testDb()
    .insert(renderJob)
    .values({
      attempt: 1,
      error: "render failed",
      finishedAt: new Date(),
      id: renderJobId,
      input: { v: 1 },
      sponsorshipId: seeded.sponsorshipIds[0] as string,
      status: "failed",
      workflowInstanceId: renderJobId,
    });
  return { ...seeded, renderJobId };
}
