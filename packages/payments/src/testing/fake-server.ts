/**
 * The Mollie fake over HTTP, for e2e (Bun only, never in workerd): the
 * API and a hosted checkout page on one local origin. Point the dev site
 * at it with `MOLLIE_API_URL` and the fake's key (`FAKE_MOLLIE_API_KEY`);
 * `webhookUrl` may be localhost then, since the fake can reach it.
 *
 * `GET /checkout/<id>` shows the payment with four buttons (Pay, Fail,
 * Cancel, Expire). Each sets the status, POSTs the webhook the way Mollie
 * does (`application/x-www-form-urlencoded`, `id=tr_…`, nothing else) and
 * redirects to the payment's `redirectUrl`.
 *
 * Control endpoints (e2e only):
 * - `POST /__fake/payments/<id>/status` `{ "status": "paid" | … }` (also calls the webhook)
 * - `POST /__fake/payments/<id>/refund` `{ "cents": n }` (a dashboard refund)
 * - `GET /__fake/health`
 *
 * Run it: `bun packages/payments/src/testing/fake-server.ts` with
 * `FAKE_MOLLIE_PORT` (4020) and optionally `FAKE_MOLLIE_WEBHOOK_URL`, which
 * replaces every payment's `webhookUrl` (a site on another port).
 */

import { escapeHtml } from "@smog/utils";
import { serve } from "bun";
import { MOLLIE_PAYMENT_STATUSES, type MolliePaymentStatus } from "../schema";
import {
  createFakeMollie,
  type FakeMollie,
  type FakePayment,
  pathParams,
} from "./fake-mollie";

export interface FakeMollieServerOptions {
  port?: number;
  /** Every webhook goes here instead of the payment's `webhookUrl`. */
  webhookUrl?: string;
}

export interface FakeMollieServer {
  fake: FakeMollie;
  stop: () => Promise<void>;
  url: string;
}

const CHECKOUT_PATH = /^\/checkout\/([^/]+)$/;
const CONTROL_PATH = /^\/__fake\/payments\/([^/]+)\/(status|refund)$/;
const OUTCOMES = ["paid", "failed", "canceled", "expired"] as const;
type Outcome = (typeof OUTCOMES)[number];

const OUTCOME_LABELS: Record<Outcome, string> = {
  canceled: "Cancel",
  expired: "Expire",
  failed: "Fail",
  paid: "Pay",
};

async function postWebhook(url: string, id: string): Promise<void> {
  try {
    const response = await fetch(url, {
      body: new URLSearchParams({ id }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    console.log(`[fake-mollie] webhook ${id} → ${response.status}`);
  } catch (error) {
    console.error(
      `[fake-mollie] Failed to deliver the webhook for ${id}:`,
      error
    );
  }
}

function checkoutPage(payment: FakePayment): Response {
  const buttons = OUTCOMES.map(
    (outcome) =>
      `<button name="outcome" type="submit" value="${outcome}">${OUTCOME_LABELS[outcome]}</button>`
  ).join("\n      ");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Fake Mollie checkout</title>
  </head>
  <body>
    <h1>Fake Mollie checkout</h1>
    <p data-testid="fake-mollie-description">${escapeHtml(payment.description)}</p>
    <p data-testid="fake-mollie-amount">EUR ${escapeHtml(payment.amountValue)}</p>
    <p data-testid="fake-mollie-status">${escapeHtml(payment.status)}</p>
    <form method="post">
      ${buttons}
    </form>
  </body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isStatus(value: unknown): value is MolliePaymentStatus {
  return (MOLLIE_PAYMENT_STATUSES as readonly unknown[]).includes(value);
}

export function startFakeMollieServer(
  options: FakeMollieServerOptions = {}
): FakeMollieServer {
  let fake: FakeMollie | undefined;

  function webhookFor(payment: FakePayment): string | null {
    return options.webhookUrl ?? payment.webhookUrl;
  }

  async function control(
    current: FakeMollie,
    id: string,
    action: string,
    request: Request
  ): Promise<Response> {
    if (!current.payments.has(id)) {
      return Response.json({ error: "unknown payment" }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      cents?: unknown;
      status?: unknown;
    };
    if (action === "refund" && typeof body.cents === "number") {
      return Response.json({
        refundedCents: current.refund(id, body.cents).refundedCents,
      });
    }
    if (action === "status" && isStatus(body.status)) {
      return Response.json({
        status: current.setStatus(id, body.status).status,
      });
    }
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  async function checkout(
    current: FakeMollie,
    id: string,
    request: Request
  ): Promise<Response> {
    const payment = current.payments.get(id);
    if (!payment) {
      return new Response("Unknown payment", { status: 404 });
    }
    if (request.method === "GET") {
      return checkoutPage(payment);
    }
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    const outcome = (await request.formData()).get("outcome");
    if (!OUTCOMES.includes(outcome as Outcome)) {
      return new Response("Unknown outcome", { status: 400 });
    }
    if (payment.status !== "open") {
      return new Response(`The payment is ${payment.status}`, { status: 409 });
    }
    current.setStatus(id, outcome as Outcome);
    await current.webhooksIdle();
    return new Response(null, {
      headers: { location: payment.redirectUrl },
      status: 303,
    });
  }

  const server = serve({
    fetch: async (request) => {
      const current = fake;
      if (!current) {
        return new Response("Starting", { status: 503 });
      }
      const url = new URL(request.url);
      if (url.pathname === "/__fake/health") {
        return Response.json({ ok: true });
      }
      const [controlId, action] = pathParams(CONTROL_PATH, url.pathname) ?? [];
      if (controlId !== undefined && request.method === "POST") {
        return await control(current, controlId, action ?? "", request);
      }
      const [checkoutId] = pathParams(CHECKOUT_PATH, url.pathname) ?? [];
      if (checkoutId !== undefined) {
        return await checkout(current, checkoutId, request);
      }
      return await current.fetch(request);
    },
    port: options.port ?? 0,
  });

  const origin = `http://localhost:${server.port}`;
  fake = createFakeMollie({
    apiUrl: origin,
    // Mollie calls the webhook after the change; the checkout's redirect
    // does not wait for it (the success page polls, ruling 2).
    webhook: async (payment) => {
      const url = webhookFor(payment);
      if (url) {
        await postWebhook(url, payment.id);
      }
    },
  });

  return {
    fake,
    stop: async () => {
      await server.stop(true);
    },
    url: origin,
  };
}

if (import.meta.main) {
  const port = Number.parseInt(process.env.FAKE_MOLLIE_PORT ?? "4020", 10);
  const webhookUrl = process.env.FAKE_MOLLIE_WEBHOOK_URL;
  const server = startFakeMollieServer({
    port,
    ...(webhookUrl ? { webhookUrl } : {}),
  });
  console.log(`[fake-mollie] listening on ${server.url}`);
}
