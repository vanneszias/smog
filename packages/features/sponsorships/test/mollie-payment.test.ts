import { createFakeMollie, type FakeMollie } from "@smog/payments/testing";
import { DAY_MS } from "@smog/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  PaymentProviderError,
  startMolliePayment,
} from "../src/server/mollie-payment";
import {
  eventsOf,
  NOW,
  paymentRow,
  SITE_URL,
  seedCheckout,
  seedRenewalPayment,
  statusOf,
  testDb,
  trailsOf,
} from "./helpers";

const db = testDb();
let fake: FakeMollie;

beforeEach(() => {
  fake = createFakeMollie();
});

/** The description of the `index`th request to the fake. */
function descriptionAt(index: number): string | undefined {
  const body = fake.requests[index]?.body as
    | { description?: string }
    | undefined;
  return body?.description;
}

describe("startMolliePayment", () => {
  it("creates the Mollie payment as ruling 2 says and stores its id and checkout", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    const result = await startMolliePayment(db, fake.mollie, {
      allowFakeWebhook: false,
      items: seeded.sponsorshipIds.map((sponsorshipId) => ({ sponsorshipId })),
      locale: "fr",
      now: NOW,
      payment: { amountCents: 10_000, id: seeded.paymentId, kind: "initial" },
      siteUrl: "https://smog.example",
    });
    const [request] = fake.requests;
    expect(request).toMatchObject({
      idempotencyKey: seeded.paymentId,
      method: "POST",
      path: "/v2/payments",
    });
    expect(request?.body).toEqual({
      amount: { currency: "EUR", value: "100.00" },
      description: "Parrainage de 2 gestes chez SMOG & Co",
      locale: "fr_BE",
      metadata: { kind: "initial", paymentId: seeded.paymentId },
      redirectUrl: `https://smog.example/sponsor/success?payment=${seeded.paymentId}`,
      webhookUrl: "https://smog.example/api/webhooks/mollie",
    });
    const row = await paymentRow(db, seeded.paymentId);
    expect(row.mollieId).toBe(result.mollieId);
    expect(row.checkoutUrl).toBe(result.checkoutUrl);
    expect(row.status).toBe("open");
  });

  it("leaves the webhook out on localhost unless the fake can reach it", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    const base = {
      items: [{ sponsorshipId: seeded.sponsorshipIds[0] as string }],
      locale: "nl" as const,
      now: NOW,
      payment: {
        amountCents: 5000,
        id: seeded.paymentId,
        kind: "initial" as const,
      },
      siteUrl: SITE_URL,
    };
    await startMolliePayment(db, fake.mollie, {
      ...base,
      allowFakeWebhook: false,
    });
    expect(fake.requests[0]?.body).not.toHaveProperty("webhookUrl");
    expect(descriptionAt(0)).toBe("Sponsoring van 1 gebaar bij SMOG & Co");
    const other = await seedCheckout(db, { count: 1 });
    await startMolliePayment(db, fake.mollie, {
      ...base,
      allowFakeWebhook: true,
      items: [{ sponsorshipId: other.sponsorshipIds[0] as string }],
      payment: { ...base.payment, id: other.paymentId },
    });
    expect(fake.requests[1]?.body).toMatchObject({
      webhookUrl: `${SITE_URL}/api/webhooks/mollie`,
    });
  });

  it("compensates an initial payment when Mollie fails: the payment fails, the gestures are free", async () => {
    const seeded = await seedCheckout(db, { count: 2 });
    fake.failNext(503);
    await expect(
      startMolliePayment(db, fake.mollie, {
        allowFakeWebhook: false,
        items: seeded.sponsorshipIds.map((sponsorshipId) => ({
          sponsorshipId,
        })),
        locale: "nl",
        now: NOW,
        payment: { amountCents: 10_000, id: seeded.paymentId, kind: "initial" },
        siteUrl: SITE_URL,
      })
    ).rejects.toBeInstanceOf(PaymentProviderError);
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("failed");
    for (const trail of await trailsOf(db, seeded.sponsorshipIds)) {
      expect(trail.status).toBe("cancelled");
      expect(trail.events.map((e) => [e.type, e.data])).toEqual([
        ["cancelled", { paymentId: seeded.paymentId, reason: "provider" }],
      ]);
    }
    await expect(
      seedCheckout(db, { gestures: seeded.gestures })
    ).resolves.toBeDefined();
  });

  it("compensates a create without a checkout link the same way", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    fake.omitCheckoutLinkNext();
    await expect(
      startMolliePayment(db, fake.mollie, {
        allowFakeWebhook: false,
        items: [{ sponsorshipId: seeded.sponsorshipIds[0] as string }],
        locale: "en",
        now: NOW,
        payment: { amountCents: 5000, id: seeded.paymentId, kind: "initial" },
        siteUrl: SITE_URL,
      })
    ).rejects.toBeInstanceOf(PaymentProviderError);
    expect((await paymentRow(db, seeded.paymentId)).status).toBe("failed");
  });

  it("marks only a renewal payment failed when Mollie fails", async () => {
    const seeded = await seedCheckout(db, {
      count: 1,
      endsAt: new Date(NOW.getTime() + 10 * DAY_MS),
      paymentStatus: "paid",
      status: "expiring",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const renewalId = await seedRenewalPayment(db, id);
    fake.failNext(500);
    await expect(
      startMolliePayment(db, fake.mollie, {
        allowFakeWebhook: false,
        items: [{ sponsorshipId: id }],
        locale: "nl",
        now: NOW,
        payment: { amountCents: 5000, id: renewalId, kind: "renewal" },
        siteUrl: SITE_URL,
      })
    ).rejects.toBeInstanceOf(PaymentProviderError);
    expect((await paymentRow(db, renewalId)).status).toBe("failed");
    expect(await statusOf(db, id)).toBe("expiring");
    expect(await eventsOf(db, id)).toEqual([]);
    expect(descriptionAt(0)).toBe("Verlenging van je sponsoring bij SMOG & Co");
  });
});
