import { describe, expect, it, spyOn } from "bun:test";
import {
  cancelPayment,
  createMollie,
  createPayment,
  getPayment,
  MollieApiError,
  MollieRateLimitError,
} from "./client";
import { createFakeMollie, FAKE_MOLLIE_API_KEY } from "./testing";

const INPUT = {
  amountCents: 6000,
  description: "Sponsoring van 1 gebaar",
  idempotencyKey: "0b6c6d4e-6c43-4e1c-9a59-8a1b4c0d9e01",
  locale: "nl",
  metadata: {
    kind: "initial",
    paymentId: "0b6c6d4e-6c43-4e1c-9a59-8a1b4c0d9e01",
  },
  redirectUrl: "https://smog.example/sponsor/success?payment=0b6c6d4e",
  webhookUrl: "https://smog.example/api/webhooks/mollie",
} as const;

const FAKE_PAYMENT_ID = /^tr_[A-Za-z0-9]{10}$/;

function quiet(): void {
  spyOn(console, "error").mockImplementation(() => undefined);
}

describe("createMollie", () => {
  it("is null without an API key", () => {
    expect(createMollie({ ENVIRONMENT: "staging" })).toBeNull();
    expect(createMollie({ ENVIRONMENT: "dev", MOLLIE_API_KEY: "" })).toBeNull();
  });

  it("always talks to api.mollie.com outside dev", () => {
    const staging = createMollie({
      ENVIRONMENT: "staging",
      MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
      MOLLIE_API_URL: "http://localhost:4020",
    });
    expect(staging?.apiUrl).toBe("https://api.mollie.com");
    const production = createMollie({
      ENVIRONMENT: "production",
      MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
      MOLLIE_API_URL: "http://localhost:4020",
    });
    expect(production?.apiUrl).toBe("https://api.mollie.com");
    const dev = createMollie({
      ENVIRONMENT: "dev",
      MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
      MOLLIE_API_URL: "http://localhost:4020/",
    });
    expect(dev?.apiUrl).toBe("http://localhost:4020");
  });
});

describe("createPayment", () => {
  it("sends the amount, the description, the URLs, the metadata, the locale and the Idempotency-Key", async () => {
    const fake = createFakeMollie();
    const payment = await createPayment(fake.mollie, INPUT);

    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    expect(request?.method).toBe("POST");
    expect(request?.path).toBe("/v2/payments");
    expect(request?.idempotencyKey).toBe(INPUT.idempotencyKey);
    expect(request?.authorization).toBe(`Bearer ${FAKE_MOLLIE_API_KEY}`);
    expect(request?.contentType).toBe("application/json");
    expect(request?.body).toEqual({
      amount: { currency: "EUR", value: "60.00" },
      description: INPUT.description,
      locale: "nl_BE",
      metadata: INPUT.metadata,
      redirectUrl: INPUT.redirectUrl,
      webhookUrl: INPUT.webhookUrl,
    });
    expect(payment).toMatchObject({
      amountCents: 6000,
      amountRefundedCents: 0,
      currency: "EUR",
      isCancelable: true,
      metadata: INPUT.metadata,
      status: "open",
    });
    expect(payment.id).toMatch(FAKE_PAYMENT_ID);
    expect(payment.checkoutUrl).toBe(`${fake.apiUrl}/checkout/${payment.id}`);
    expect(payment.createdAt).toBeInstanceOf(Date);
    expect(payment.paidAt).toBeUndefined();
  });

  it("maps the app locales to Mollie's and omits a missing webhookUrl", async () => {
    const fake = createFakeMollie();
    await createPayment(fake.mollie, {
      ...INPUT,
      idempotencyKey: "a",
      locale: "fr",
      webhookUrl: undefined,
    });
    await createPayment(fake.mollie, {
      ...INPUT,
      idempotencyKey: "b",
      locale: "en",
    });
    expect(fake.requests[0]?.body).toMatchObject({ locale: "fr_BE" });
    expect(fake.requests[0]?.body).not.toHaveProperty("webhookUrl");
    expect(fake.requests[1]?.body).toMatchObject({ locale: "en_US" });
  });

  it("returns the same payment for a repeated Idempotency-Key", async () => {
    const fake = createFakeMollie();
    const first = await createPayment(fake.mollie, INPUT);
    const second = await createPayment(fake.mollie, INPUT);
    expect(second.id).toBe(first.id);
    expect(fake.payments.size).toBe(1);
  });

  it("refuses an amount that is not positive integer cents before calling Mollie", async () => {
    const fake = createFakeMollie();
    for (const amountCents of [0, -100, 50.5]) {
      // biome-ignore lint/performance/noAwaitInLoops: three refusals, checked in order.
      await expect(
        createPayment(fake.mollie, { ...INPUT, amountCents })
      ).rejects.toThrow("[payments]");
    }
    expect(fake.requests).toHaveLength(0);
  });

  it("requires the checkout link in the answer", async () => {
    quiet();
    const fake = createFakeMollie();
    fake.omitCheckoutLinkNext();
    const error = await createPayment(fake.mollie, INPUT).catch((e) => e);
    expect(error).toBeInstanceOf(MollieApiError);
    expect(error.retryable).toBe(false);
  });
});

describe("getPayment", () => {
  it("re-reads the payment, with its status, refunds and paid date", async () => {
    const fake = createFakeMollie();
    const created = await createPayment(fake.mollie, INPUT);
    fake.setStatus(created.id, "paid");
    fake.refund(created.id, 1000);

    const payment = await getPayment(fake.mollie, created.id);

    expect(payment).toMatchObject({
      amountCents: 6000,
      amountRefundedCents: 1000,
      id: created.id,
      isCancelable: false,
      status: "paid",
    });
    expect(payment?.paidAt).toBeInstanceOf(Date);
    expect(payment?.checkoutUrl).toBeUndefined();
    expect(fake.requests.at(-1)).toMatchObject({
      method: "GET",
      path: `/v2/payments/${created.id}`,
    });
  });

  it("is null for a payment Mollie does not know (404)", async () => {
    const fake = createFakeMollie();
    expect(await getPayment(fake.mollie, "tr_unknown123")).toBeNull();
  });

  it("refuses a malformed id without calling Mollie", async () => {
    const fake = createFakeMollie();
    await expect(getPayment(fake.mollie, "../v2/methods")).rejects.toThrow(
      "[payments]"
    );
    expect(fake.requests).toHaveLength(0);
  });

  it("throws a retryable MollieApiError on a 5xx", async () => {
    quiet();
    const fake = createFakeMollie();
    fake.failNext(503);
    const error = await getPayment(fake.mollie, "tr_whatever1").catch((e) => e);
    expect(error).toBeInstanceOf(MollieApiError);
    expect(error.status).toBe(503);
    expect(error.retryable).toBe(true);
  });

  it("throws a MollieRateLimitError on a 429", async () => {
    quiet();
    const fake = createFakeMollie();
    fake.failNext(429);
    const error = await getPayment(fake.mollie, "tr_whatever1").catch((e) => e);
    expect(error).toBeInstanceOf(MollieRateLimitError);
    expect(error).toBeInstanceOf(MollieApiError);
    expect(error.retryable).toBe(true);
  });

  it("throws a non-retryable MollieApiError on a 401 and never logs the key", async () => {
    const log = spyOn(console, "error").mockImplementation(() => undefined);
    const fake = createFakeMollie();
    fake.failNext(401);
    const error = await getPayment(fake.mollie, "tr_whatever1").catch((e) => e);
    expect(error.retryable).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain(FAKE_MOLLIE_API_KEY);
    log.mockRestore();
  });

  it("turns a network failure into a retryable MollieApiError", async () => {
    quiet();
    const mollie = createMollie(
      { ENVIRONMENT: "dev", MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY },
      { fetch: () => Promise.reject(new TypeError("fetch failed")) }
    );
    if (!mollie) {
      throw new Error("no client");
    }
    const error = await getPayment(mollie, "tr_whatever1").catch((e) => e);
    expect(error).toBeInstanceOf(MollieApiError);
    expect(error.status).toBe(0);
    expect(error.retryable).toBe(true);
  });

  it("refuses an answer with a malformed amount", async () => {
    quiet();
    const fake = createFakeMollie();
    const created = await createPayment(fake.mollie, INPUT);
    fake.corruptAmount(created.id, "60.0");
    await expect(getPayment(fake.mollie, created.id)).rejects.toBeInstanceOf(
      MollieApiError
    );
  });
});

describe("cancelPayment", () => {
  it("cancels an open payment", async () => {
    const fake = createFakeMollie();
    const created = await createPayment(fake.mollie, INPUT);
    const canceled = await cancelPayment(fake.mollie, created.id);
    expect(canceled.status).toBe("canceled");
    expect(fake.requests.at(-1)).toMatchObject({
      method: "DELETE",
      path: `/v2/payments/${created.id}`,
    });
  });

  it("answers Mollie's 422 for a payment that cannot be canceled", async () => {
    quiet();
    const fake = createFakeMollie();
    const created = await createPayment(fake.mollie, INPUT);
    fake.setStatus(created.id, "paid");
    const error = await cancelPayment(fake.mollie, created.id).catch((e) => e);
    expect(error).toBeInstanceOf(MollieApiError);
    expect(error.status).toBe(422);
    expect(error.retryable).toBe(false);
  });
});

describe("the fake's webhook", () => {
  it("is called with the payment id on every status change and refund", async () => {
    const calls: string[] = [];
    const fake = createFakeMollie({
      webhook: (payment) => {
        calls.push(`${payment.id}:${payment.status}`);
      },
    });
    const created = await createPayment(fake.mollie, INPUT);
    fake.setStatus(created.id, "paid");
    fake.refund(created.id, 6000);
    expect(calls).toEqual([`${created.id}:paid`, `${created.id}:paid`]);
  });
});
