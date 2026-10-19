import {
  invoiceRequest,
  payment,
  renderJob,
  sponsorship,
  sponsorshipEvent,
} from "@smog/db";
import { DAY_MS, newId } from "@smog/utils";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { handlePaymentSettled, queuedRenderJob } from "../src/server/settled";
import { eventStatement } from "../src/server/transition";
import {
  makeAdmin,
  NOW,
  SITE_URL,
  seedCheckout,
  seedRenewalPayment,
  testDb,
} from "./helpers";

const db = testDb();

async function jobsOf(sponsorshipIds: string[]) {
  return await db
    .select()
    .from(renderJob)
    .where(inArray(renderJob.sponsorshipId, sponsorshipIds));
}

function settled(paymentId: string) {
  return handlePaymentSettled(db, { now: NOW, paymentId, siteUrl: SITE_URL });
}

describe("handlePaymentSettled (the payment.settled fan-out)", () => {
  it("creates one render job per rendering item and keys every email; a second run creates nothing new", async () => {
    const admin = await makeAdmin(db);
    const seeded = await seedCheckout(db, {
      paymentStatus: "paid",
      status: "rendering",
    });
    await db.insert(invoiceRequest).values({
      email: "billing@example.com",
      name: "Acme BV",
      sponsorId: seeded.sponsorId,
      vatNumber: "0123456749",
    });
    const first = await settled(seeded.paymentId);
    const jobs = await jobsOf(seeded.sponsorshipIds);
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.status === "queued")).toBe(true);
    expect(first.events).toEqual(
      expect.arrayContaining(
        jobs.map((job) => ({ renderJobId: job.id, type: "render.requested" }))
      )
    );
    expect(first.events).toHaveLength(2);
    const keys = first.notify.map((email) => email.idempotencyKey).sort();
    expect(keys).toEqual(
      [
        `admin_new_sponsorship:${seeded.paymentId}:${admin.id}`,
        ...seeded.sponsorshipIds.flatMap((id) => [
          `payment_confirmed:${seeded.paymentId}:${id}`,
          `sponsorship_received:${id}`,
        ]),
      ].sort()
    );
    const adminMail = first.notify.find(
      (email) => email.template === "transactional/admin-new-sponsorship"
    );
    expect(adminMail).toMatchObject({
      locale: "fr",
      props: {
        contact: { company: null, name: "Alex Sponsor" },
        displayName: "Acme BV",
        invoice: { name: "Acme BV", vatNumber: "0123456749" },
        kind: "initial",
        paymentId: seeded.paymentId,
        totalCents: 10_000,
        url: `${SITE_URL}/admin/sponsorships?payment=${seeded.paymentId}`,
      },
      to: admin.email,
    });
    const confirmed = first.notify.find(
      (email) => email.template === "transactional/payment-confirmed"
    );
    expect(confirmed).toMatchObject({
      locale: "nl",
      props: { amountCents: 5000, endsAt: null, kind: "initial" },
      to: `${seeded.sponsorId}@example.com`,
    });

    const second = await settled(seeded.paymentId);
    expect(await jobsOf(seeded.sponsorshipIds)).toHaveLength(2);
    // The queued jobs are requested again (the start is idempotent) and
    // the emails carry the same keys (the consumer skips a sent key).
    expect(second.events).toHaveLength(first.events.length);
    expect(second.events).toEqual(expect.arrayContaining([...first.events]));
    expect(second.notify.map((email) => email.idempotencyKey).sort()).toEqual(
      keys
    );
  });

  it("acts only on items past payment: a cancelled or flagged item gets no job and no email", async () => {
    const seeded = await seedCheckout(db, {
      paymentStatus: "refund_needed",
      status: "rendering",
    });
    const [revived, flagged] = seeded.sponsorshipIds as [string, string];
    // `flagged` lost its gesture: still `cancelled`, with the refund flag.
    await db
      .update(sponsorship)
      .set({ status: "cancelled" })
      .where(eq(sponsorship.id, flagged));
    await db.batch([
      eventStatement(db, {
        actorId: null,
        data: { paymentId: seeded.paymentId, reason: "late" },
        now: NOW,
        sponsorshipId: flagged,
        type: "refund_needed",
      }),
    ]);
    const out = await settled(seeded.paymentId);
    expect(
      (await jobsOf(seeded.sponsorshipIds)).map((j) => j.sponsorshipId)
    ).toEqual([revived]);
    expect(
      out.notify
        .map((email) => email.idempotencyKey)
        .filter((key) => key?.includes(flagged))
    ).toEqual([]);
    expect(out.notify.map((email) => email.idempotencyKey)).toContain(
      `sponsorship_received:${revived}`
    );
  });

  it("confirms a renewal with the new end and creates no job", async () => {
    const endsAt = new Date("2027-11-03T10:00:00.000Z");
    const seeded = await seedCheckout(db, { count: 1, endsAt, status: "live" });
    const sponsorshipId = seeded.sponsorshipIds[0] as string;
    const renewalId = await seedRenewalPayment(db, sponsorshipId, {
      status: "paid",
    });
    await makeAdmin(db);
    const out = await settled(renewalId);
    expect(out.events).toEqual([]);
    expect(out.notify).toEqual([
      {
        idempotencyKey: `payment_confirmed:${renewalId}:${sponsorshipId}`,
        locale: "nl",
        props: {
          amountCents: 5000,
          endsAt: endsAt.toISOString(),
          gestureName: seeded.gestures[0]?.name,
          kind: "renewal",
          name: "Alex Sponsor",
        },
        template: "transactional/payment-confirmed",
        to: `${seeded.sponsorId}@example.com`,
      },
    ]);
  });

  it("sends the emails only within 6 days of paid_at (inside the 7-day KV marker); jobs always", async () => {
    await makeAdmin(db);
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "paid",
      status: "rendering",
    });
    await db
      .update(payment)
      .set({ paidAt: NOW })
      .where(eq(payment.id, seeded.paymentId));
    const at = (days: number) =>
      handlePaymentSettled(db, {
        now: new Date(NOW.getTime() + days * DAY_MS),
        paymentId: seeded.paymentId,
        siteUrl: SITE_URL,
      });
    // A refund or chargeback webhook 30 days later re-sends nothing.
    const late = await at(30);
    expect(late.notify).toEqual([]);
    // The render job is still created and requested.
    expect(late.events).toHaveLength(1);
    expect(await jobsOf(seeded.sponsorshipIds)).toHaveLength(1);
    expect((await at(6)).notify).toEqual([]);
    expect((await at(5.9)).notify.length).toBeGreaterThan(0);
  });

  it("does nothing for a payment that is not paid", async () => {
    const seeded = await seedCheckout(db, { status: "awaiting_payment" });
    expect(await settled(seeded.paymentId)).toEqual({ events: [], notify: [] });
    expect(await jobsOf(seeded.sponsorshipIds)).toEqual([]);
  });

  it("queuedRenderJob answers a queued job's input and null otherwise", async () => {
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "paid",
      status: "rendering",
    });
    const out = await settled(seeded.paymentId);
    const [event] = out.events;
    const renderJobId =
      event?.type === "render.requested" ? event.renderJobId : "";
    expect(await queuedRenderJob(db, renderJobId)).toEqual({
      input: {
        displayName: "Acme BV",
        logoKey: null,
        sourcePlaybackId: seeded.gestures[0]?.playbackId,
        v: 1,
      },
      renderJobId,
    });
    await db
      .update(renderJob)
      .set({ status: "succeeded" })
      .where(eq(renderJob.id, renderJobId));
    expect(await queuedRenderJob(db, renderJobId)).toBeNull();
    expect(await queuedRenderJob(db, "missing")).toBeNull();
  });

  it("measures the 6-day window from our first settling event, not Mollie's paidAt (fix wave, jobs I-1)", async () => {
    await makeAdmin(db);
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "paid",
      status: "rendering",
    });
    // Mollie took the money 8 days ago; we learned of it an hour ago.
    await db
      .update(payment)
      .set({ paidAt: new Date(NOW.getTime() - 8 * DAY_MS) })
      .where(eq(payment.id, seeded.paymentId));
    // A fixture: the trail the settle left (an insert).
    await db.insert(sponsorshipEvent).values({
      createdAt: new Date(NOW.getTime() - 60 * 60_000),
      data: { paymentId: seeded.paymentId },
      id: newId(),
      sponsorshipId: seeded.sponsorshipIds[0] as string,
      type: "payment_paid",
    });
    const out = await settled(seeded.paymentId);
    const templates = out.notify.map((email) => email.template);
    expect(templates).toContain("transactional/sponsorship-received");
    expect(templates).toContain("transactional/payment-confirmed");
    expect(templates).toContain("transactional/admin-new-sponsorship");
    // Six days after our settle, the emails stop.
    const later = await handlePaymentSettled(db, {
      now: new Date(NOW.getTime() + 6 * DAY_MS),
      paymentId: seeded.paymentId,
      siteUrl: SITE_URL,
    });
    expect(later.notify).toEqual([]);
  });
});
