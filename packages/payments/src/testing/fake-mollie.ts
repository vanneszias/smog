import { createMollie, type MollieClient, type MollieFetch } from "../client";
import { centsToMollieValue, mollieValueToCents } from "../money";
import type { MolliePaymentStatus } from "../schema";

/**
 * An in-memory Mollie Payments v2 API: a `fetch` that answers the calls
 * `@smog/payments` makes (create with `Idempotency-Key`, get, cancel) the
 * way Mollie does, so the real client code runs against it. No network.
 * `./fake-server` serves the same handler over HTTP for e2e, with a
 * hosted checkout page.
 */

/** A key the fake accepts (and `workerEnvSchema` accepts in dev). */
export const FAKE_MOLLIE_API_KEY = "test_fakeMollieKeyForTestsOnly000000";

export interface FakeMollieRequest {
  authorization: string | null;
  body?: unknown;
  contentType: string | null;
  idempotencyKey: string | null;
  method: string;
  path: string;
}

export interface FakePayment {
  /** Mollie's string, e.g. `"60.00"` (`corruptAmount` may break it). */
  amountValue: string;
  createdAt: Date;
  description: string;
  id: string;
  locale: string | null;
  metadata: unknown;
  paidAt: Date | null;
  redirectUrl: string;
  refundedCents: number;
  status: MolliePaymentStatus;
  webhookUrl: string | null;
}

export interface FakeMollieOptions {
  /** Where the client points (`MOLLIE_API_URL`); the checkout page is here too. */
  apiUrl?: string;
  /** Called after every status change and refund (Mollie calls the webhook). */
  webhook?: (payment: FakePayment) => void | Promise<void>;
}

export interface FakeMollie {
  readonly apiUrl: string;
  /** The next answer for `id` has this amount value (a tampered payment). */
  corruptAmount: (id: string, value: string) => void;
  /** The next API request answers `status` (an outage or a rate limit). */
  failNext: (status: number) => void;
  fetch: MollieFetch;
  /** A client wired to this fake. */
  readonly mollie: MollieClient;
  /** The next create answers without `_links.checkout`. */
  omitCheckoutLinkNext: () => void;
  readonly payments: Map<string, FakePayment>;
  /** Mollie refunds `cents` more (as a dashboard refund) and calls the webhook. */
  refund: (id: string, cents: number) => FakePayment;
  /** Every API request, in order, with its JSON body and headers. */
  readonly requests: FakeMollieRequest[];
  /** The payment takes `status` (the customer paid, failed, …) and the webhook is called. */
  setStatus: (id: string, status: MolliePaymentStatus) => FakePayment;
  /** Resolves once every webhook call started so far has finished. */
  webhooksIdle: () => Promise<void>;
}

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const AUTHORIZATION = /^Bearer (test|live)_\w{20,}$/;
const PAYMENT_PATH = /^\/v2\/payments\/([^/]+)$/;
const TRAILING_SLASHES = /\/+$/;

/**
 * The decoded captures of an anchored path pattern, or `null` when it does
 * not match (test + replace: the patterns are anchored, so replacing the
 * whole path leaves the captures).
 */
export function pathParams(pattern: RegExp, pathname: string): string[] | null {
  if (!pattern.test(pathname)) {
    return null;
  }
  const groups = pattern.source.split("(").length - 1;
  return Array.from({ length: groups }, (_, index) =>
    decodeURIComponent(pathname.replace(pattern, `$${index + 1}`))
  );
}
/** Statuses Mollie can still cancel (`isCancelable`, for the fake). */
const CANCELABLE: readonly MolliePaymentStatus[] = ["open"];

function randomId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

function error(status: number, title: string, detail: string): Response {
  return Response.json(
    {
      _links: {
        documentation: {
          href: "https://docs.mollie.com/overview/handling-errors",
          type: "text/html",
        },
      },
      detail,
      status,
      title,
    },
    { headers: { "content-type": "application/hal+json" }, status }
  );
}

/** A request as `FakeMollie.requests` keeps it, with its JSON body. */
async function recordOf(
  request: Request,
  url: URL
): Promise<FakeMollieRequest> {
  const text = request.method === "GET" ? "" : await request.text();
  const record: FakeMollieRequest = {
    authorization: request.headers.get("authorization"),
    contentType: request.headers.get("content-type"),
    idempotencyKey: request.headers.get("idempotency-key"),
    method: request.method,
    path: url.pathname,
  };
  if (text) {
    try {
      record.body = JSON.parse(text);
    } catch {
      record.body = text;
    }
  }
  return record;
}

interface CreateBody {
  amount?: { currency?: unknown; value?: unknown };
  description?: unknown;
  locale?: unknown;
  metadata?: unknown;
  redirectUrl?: unknown;
  webhookUrl?: unknown;
}

export function createFakeMollie(options: FakeMollieOptions = {}): FakeMollie {
  const apiUrl = (options.apiUrl ?? "https://api.mollie.test").replace(
    TRAILING_SLASHES,
    ""
  );
  const payments = new Map<string, FakePayment>();
  const requests: FakeMollieRequest[] = [];
  const byIdempotencyKey = new Map<string, string>();
  const corrupt = new Map<string, string>();
  let failStatus: number | null = null;
  let omitCheckout = false;

  function paymentJson(payment: FakePayment, withCheckout = true) {
    const value = corrupt.get(payment.id) ?? payment.amountValue;
    corrupt.delete(payment.id);
    const open = payment.status === "open";
    return {
      _links: {
        ...(open && withCheckout
          ? {
              checkout: {
                href: `${apiUrl}/checkout/${payment.id}`,
                type: "text/html",
              },
            }
          : {}),
        dashboard: {
          href: `https://my.mollie.com/dashboard/payments/${payment.id}`,
          type: "text/html",
        },
        self: {
          href: `${apiUrl}/v2/payments/${payment.id}`,
          type: "application/hal+json",
        },
      },
      amount: { currency: "EUR", value },
      ...(payment.refundedCents > 0
        ? {
            amountRefunded: {
              currency: "EUR",
              value: centsToMollieValue(payment.refundedCents),
            },
          }
        : {}),
      createdAt: payment.createdAt.toISOString().replace(".000Z", "+00:00"),
      description: payment.description,
      id: payment.id,
      isCancelable: CANCELABLE.includes(payment.status),
      locale: payment.locale,
      metadata: payment.metadata,
      method: null,
      mode: "test",
      ...(payment.paidAt
        ? { paidAt: payment.paidAt.toISOString().replace(".000Z", "+00:00") }
        : {}),
      redirectUrl: payment.redirectUrl,
      resource: "payment",
      sequenceType: "oneoff",
      status: payment.status,
      webhookUrl: payment.webhookUrl,
    };
  }

  function answer(payment: FakePayment, status = 200, withCheckout = true) {
    return Response.json(paymentJson(payment, withCheckout), {
      headers: { "content-type": "application/hal+json" },
      status,
    });
  }

  function create(body: CreateBody, key: string | null): Response {
    const known = key ? byIdempotencyKey.get(key) : undefined;
    const existing = known ? payments.get(known) : undefined;
    if (existing) {
      return answer(existing, 201);
    }
    const value = body.amount?.value;
    if (
      typeof value !== "string" ||
      body.amount?.currency !== "EUR" ||
      typeof body.description !== "string" ||
      typeof body.redirectUrl !== "string"
    ) {
      return error(422, "Unprocessable Entity", "The payment is incomplete");
    }
    try {
      mollieValueToCents(value);
    } catch {
      return error(422, "Unprocessable Entity", "The amount is invalid");
    }
    const payment: FakePayment = {
      amountValue: value,
      createdAt: new Date(Math.floor(Date.now() / 1000) * 1000),
      description: body.description,
      id: `tr_${randomId()}`,
      locale: typeof body.locale === "string" ? body.locale : null,
      metadata: body.metadata ?? null,
      paidAt: null,
      redirectUrl: body.redirectUrl,
      refundedCents: 0,
      status: "open",
      webhookUrl: typeof body.webhookUrl === "string" ? body.webhookUrl : null,
    };
    payments.set(payment.id, payment);
    if (key) {
      byIdempotencyKey.set(key, payment.id);
    }
    const withCheckout = !omitCheckout;
    omitCheckout = false;
    return answer(payment, 201, withCheckout);
  }

  /** `GET` reads the payment, `DELETE` cancels it while it is open. */
  function onPayment(method: string, payment: FakePayment): Response {
    if (method === "GET") {
      return answer(payment);
    }
    if (method !== "DELETE") {
      return error(405, "Method Not Allowed", "Not supported by the fake");
    }
    if (!CANCELABLE.includes(payment.status)) {
      return error(
        422,
        "Unprocessable Entity",
        "The payment cannot be canceled"
      );
    }
    payment.status = "canceled";
    return answer(payment);
  }

  async function handle(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const record = await recordOf(request, url);
    requests.push(record);
    if (failStatus !== null) {
      const status = failStatus;
      failStatus = null;
      return error(status, "Failure", "The fake was told to fail");
    }
    if (!AUTHORIZATION.test(record.authorization ?? "")) {
      return error(401, "Unauthorized Request", "Missing authentication");
    }
    if (url.pathname === "/v2/payments" && request.method === "POST") {
      return create((record.body ?? {}) as CreateBody, record.idempotencyKey);
    }
    const [id] = pathParams(PAYMENT_PATH, url.pathname) ?? [];
    const payment = id === undefined ? undefined : payments.get(id);
    if (!payment) {
      return error(404, "Not Found", "No payment exists with this token.");
    }
    return onPayment(request.method, payment);
  }

  function required(id: string): FakePayment {
    const payment = payments.get(id);
    if (!payment) {
      throw new Error(`[fake-mollie] No payment ${id}`);
    }
    return payment;
  }

  const pending = new Set<Promise<void>>();

  function notify(payment: FakePayment): void {
    const result = options.webhook?.(payment);
    if (result instanceof Promise) {
      const call = result
        .catch((cause: unknown) => {
          console.error("[fake-mollie] Failed to call the webhook:", cause);
        })
        .finally(() => {
          pending.delete(call);
        });
      pending.add(call);
    }
  }

  const client = createMollie(
    {
      ENVIRONMENT: "dev",
      MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
      MOLLIE_API_URL: apiUrl,
    },
    { fetch: handle }
  );
  if (!client) {
    throw new Error("[fake-mollie] Failed to build the client");
  }

  return {
    apiUrl,
    corruptAmount: (id, value) => {
      corrupt.set(id, value);
    },
    failNext: (status) => {
      failStatus = status;
    },
    fetch: handle,
    mollie: client,
    omitCheckoutLinkNext: () => {
      omitCheckout = true;
    },
    payments,
    refund: (id, cents) => {
      const payment = required(id);
      payment.refundedCents = Math.min(
        payment.refundedCents + cents,
        mollieValueToCents(payment.amountValue)
      );
      notify(payment);
      return payment;
    },
    requests,
    setStatus: (id, status) => {
      const payment = required(id);
      payment.status = status;
      if (status === "paid" && !payment.paidAt) {
        payment.paidAt = new Date(Math.floor(Date.now() / 1000) * 1000);
      }
      notify(payment);
      return payment;
    },
    webhooksIdle: async () => {
      await Promise.all([...pending]);
    },
  };
}
