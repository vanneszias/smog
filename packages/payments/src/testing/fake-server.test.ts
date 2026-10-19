import { afterAll, describe, expect, it } from "bun:test";
import { createMollie, createPayment, getPayment } from "../client";
import { FAKE_MOLLIE_API_KEY } from "./fake-mollie";
import { startFakeMollieServer } from "./fake-server";

const received: { body: string; contentType: string | null }[] = [];

const receiver = Bun.serve({
  fetch: async (request) => {
    received.push({
      body: await request.text(),
      contentType: request.headers.get("content-type"),
    });
    return new Response(null, { status: 200 });
  },
  port: 0,
});

const server = startFakeMollieServer();

afterAll(async () => {
  await server.stop();
  await receiver.stop(true);
});

function client() {
  const mollie = createMollie({
    ENVIRONMENT: "dev",
    MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
    MOLLIE_API_URL: server.url,
  });
  if (!mollie) {
    throw new Error("no client");
  }
  return mollie;
}

async function newPayment(webhook = true) {
  return await createPayment(client(), {
    amountCents: 5000,
    description: "Sponsoring <b>1</b>",
    idempotencyKey: crypto.randomUUID(),
    locale: "nl",
    metadata: { kind: "initial", paymentId: "p-1" },
    redirectUrl: "https://smog.example/sponsor/success?payment=p-1",
    webhookUrl: webhook ? `http://localhost:${receiver.port}/hook` : undefined,
  });
}

describe("the fake Mollie server", () => {
  it("serves the API over HTTP", async () => {
    const payment = await newPayment();
    expect(payment.checkoutUrl).toBe(`${server.url}/checkout/${payment.id}`);
    expect((await getPayment(client(), payment.id))?.status).toBe("open");
  });

  it("hosts a checkout page with the four outcomes, escaped", async () => {
    const payment = await newPayment();
    const response = await fetch(payment.checkoutUrl);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    for (const outcome of ["paid", "failed", "canceled", "expired"]) {
      expect(html).toContain(`value="${outcome}"`);
    }
    expect(html).toContain("50.00");
    expect(html).toContain("Sponsoring &lt;b&gt;1&lt;/b&gt;");
    expect(html).not.toContain("<b>1</b>");
  });

  it("Pay sets the status, posts the form webhook and redirects to redirectUrl", async () => {
    const payment = await newPayment();
    received.length = 0;
    const response = await fetch(payment.checkoutUrl, {
      body: new URLSearchParams({ outcome: "paid" }),
      method: "POST",
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://smog.example/sponsor/success?payment=p-1"
    );
    expect(received).toEqual([
      {
        body: `id=${payment.id}`,
        contentType: "application/x-www-form-urlencoded",
      },
    ]);
    const after = await getPayment(client(), payment.id);
    expect(after?.status).toBe("paid");
    expect(after?.paidAt).toBeInstanceOf(Date);
  });

  it("Fail, Cancel and Expire set their status; a settled payment cannot be paid again", async () => {
    for (const outcome of ["failed", "canceled", "expired"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one checkout after another, against one server.
      const payment = await newPayment(false);
      await fetch(payment.checkoutUrl, {
        body: new URLSearchParams({ outcome }),
        method: "POST",
        redirect: "manual",
      });
      expect((await getPayment(client(), payment.id))?.status).toBe(outcome);
      const again = await fetch(payment.checkoutUrl, {
        body: new URLSearchParams({ outcome: "paid" }),
        method: "POST",
        redirect: "manual",
      });
      expect(again.status).toBe(409);
    }
  });

  it("has control endpoints for the e2e", async () => {
    const payment = await newPayment(false);
    expect(await (await fetch(`${server.url}/__fake/health`)).json()).toEqual({
      ok: true,
    });
    const refund = await fetch(
      `${server.url}/__fake/payments/${payment.id}/refund`,
      { body: JSON.stringify({ cents: 5000 }), method: "POST" }
    );
    expect(refund.status).toBe(200);
    const status = await fetch(
      `${server.url}/__fake/payments/${payment.id}/status`,
      { body: JSON.stringify({ status: "paid" }), method: "POST" }
    );
    expect(status.status).toBe(200);
    const after = await getPayment(client(), payment.id);
    expect(after).toMatchObject({ amountRefundedCents: 5000, status: "paid" });
    const unknown = await fetch(`${server.url}/checkout/tr_nothere1`);
    expect(unknown.status).toBe(404);
  });
});
