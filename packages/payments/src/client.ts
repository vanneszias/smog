import type { Locale } from "@smog/config/constants";
import { MOLLIE_DEFAULT_API_URL } from "@smog/config/env/worker";
import { centsToMollieValue } from "./money";
import {
  MOLLIE_PAYMENT_ID,
  type MolliePayment,
  mollieApiPaymentSchema,
} from "./schema";

/**
 * The part of the Worker env the Mollie client reads
 * (`@smog/config/env/worker`). `MOLLIE_API_URL` points at the Mollie fake
 * in dev and e2e only.
 */
export interface MollieEnv {
  /** Outside `dev` the client always talks to the real Mollie API. */
  ENVIRONMENT?: string | undefined;
  MOLLIE_API_KEY?: string | undefined;
  MOLLIE_API_URL?: string | undefined;
}

/** `fetch` as the client calls it (the fake implements just this). */
export type MollieFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface MollieClientOptions {
  /** Tests inject the in-memory fake (`@smog/payments/testing`). */
  fetch?: MollieFetch | undefined;
}

/**
 * A thin, typed Mollie Payments v2 client over `fetch`: create, get and
 * cancel (no SDK: it cannot send `Idempotency-Key`; DECISIONS, phase 6).
 * It holds only the key, so one per request is free.
 */
export interface MollieClient {
  readonly apiUrl: string;
  readonly authorization: string;
  readonly fetch: MollieFetch;
}

/**
 * A Mollie answer that is not 2xx, a network failure (`status` 0) or a
 * body we cannot read. `retryable` is true for 5xx, 429 and network
 * failures: the webhook answers 503 for those, so Mollie retries.
 */
export class MollieApiError extends Error {
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    message: string,
    status: number,
    retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "MollieApiError";
    this.retryable = retryable;
    this.status = status;
  }
}

/** Mollie's 429. Retryable; the cron and the webhook back off. */
export class MollieRateLimitError extends MollieApiError {
  constructor(message: string) {
    super(message, 429, true);
    this.name = "MollieRateLimitError";
  }
}

const TRAILING_SLASHES = /\/+$/;

/**
 * The Mollie client, or `null` without `MOLLIE_API_KEY` (staging until its
 * key is set): checkout then answers `paymentsUnavailable` and the webhook
 * 503 (ruling 5).
 */
export function createMollie(
  env: MollieEnv,
  options: MollieClientOptions = {}
): MollieClient | null {
  const key = env.MOLLIE_API_KEY;
  if (!key) {
    return null;
  }
  // Defence in depth (the env schema refuses it too): staging and
  // production never send the key to a URL other than api.mollie.com.
  const deployed = env.ENVIRONMENT !== undefined && env.ENVIRONMENT !== "dev";
  const apiUrl = (
    (deployed ? undefined : env.MOLLIE_API_URL) || MOLLIE_DEFAULT_API_URL
  ).replace(TRAILING_SLASHES, "");
  return {
    apiUrl,
    authorization: `Bearer ${key}`,
    // Bound: a bare `fetch` reference loses its `this` in workerd.
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
  };
}

interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  method: "GET" | "POST" | "DELETE";
  /** Answers 404 with `null` instead of throwing. */
  nullOn404?: boolean;
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

/**
 * One Mollie call that answers a payment. A non-2xx answer, a network
 * failure or a body that does not parse throws `MollieApiError`, logged
 * with `[payments]` and never with the key or the body.
 */
async function paymentRequest(
  mollie: MollieClient,
  path: string,
  options: RequestOptions & { nullOn404: true }
): Promise<MolliePayment | null>;
async function paymentRequest(
  mollie: MollieClient,
  path: string,
  options: RequestOptions
): Promise<MolliePayment>;
async function paymentRequest(
  mollie: MollieClient,
  path: string,
  { body, idempotencyKey, method, nullOn404 = false }: RequestOptions
): Promise<MolliePayment | null> {
  const headers: Record<string, string> = {
    accept: "application/hal+json",
    authorization: mollie.authorization,
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (idempotencyKey !== undefined) {
    headers["idempotency-key"] = idempotencyKey;
  }
  let response: Response;
  try {
    response = await mollie.fetch(`${mollie.apiUrl}${path}`, {
      body: body === undefined ? null : JSON.stringify(body),
      headers,
      method,
    });
  } catch (cause) {
    const error = new MollieApiError(
      `[payments] Failed to reach Mollie (${method} ${path})`,
      0,
      true,
      { cause }
    );
    console.error(error.message, cause);
    throw error;
  }
  if (response.status === 404 && nullOn404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    const message = `[payments] Mollie answered ${response.status} to ${method} ${path}`;
    const error =
      response.status === 429
        ? new MollieRateLimitError(message)
        : new MollieApiError(
            message,
            response.status,
            isRetryable(response.status)
          );
    console.error(error.message);
    throw error;
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    const error = new MollieApiError(
      `[payments] Mollie answered ${method} ${path} with a body that is not JSON`,
      response.status,
      true,
      { cause }
    );
    console.error(error.message);
    throw error;
  }
  const parsed = mollieApiPaymentSchema.safeParse(json);
  if (!parsed.success) {
    const error = new MollieApiError(
      `[payments] Mollie answered ${method} ${path} with an unexpected payment`,
      response.status,
      false
    );
    console.error(error.message, parsed.error.issues.slice(0, 3));
    throw error;
  }
  return parsed.data;
}

function paymentPath(id: string): string {
  if (!MOLLIE_PAYMENT_ID.test(id)) {
    throw new TypeError(
      `[payments] Not a Mollie payment id: ${JSON.stringify(id)}`
    );
  }
  return `/v2/payments/${id}`;
}

/** The checkout's language at Mollie (ruling 2). */
export const MOLLIE_LOCALES = {
  en: "en_US",
  fr: "fr_BE",
  nl: "nl_BE",
} as const satisfies Record<Locale, string>;

export interface CreatePaymentInput {
  /** Integer cents, more than 0. */
  amountCents: number;
  /** Shown on the checkout and the bank statement. */
  description: string;
  /** Our `payment.id`: a retry with it returns the same Mollie payment. */
  idempotencyKey: string;
  locale: Locale;
  /** `{ paymentId, kind }`; Mollie keeps at most 1 KB. */
  metadata: Record<string, string>;
  redirectUrl: string;
  /** Left out when Mollie could not reach it (localhost). */
  webhookUrl?: string | undefined;
}

/**
 * `POST /v2/payments` with `Idempotency-Key`, in EUR, without `method`
 * (Mollie shows the profile's methods). The answer must carry
 * `_links.checkout.href`.
 */
export async function createPayment(
  mollie: MollieClient,
  input: CreatePaymentInput
): Promise<MolliePayment & { checkoutUrl: string }> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new RangeError(
      `[payments] A payment needs a positive integer of cents, got ${input.amountCents}`
    );
  }
  const payment = await paymentRequest(mollie, "/v2/payments", {
    body: {
      amount: { currency: "EUR", value: centsToMollieValue(input.amountCents) },
      description: input.description,
      locale: MOLLIE_LOCALES[input.locale],
      metadata: input.metadata,
      redirectUrl: input.redirectUrl,
      ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
    },
    idempotencyKey: input.idempotencyKey,
    method: "POST",
  });
  const { checkoutUrl } = payment;
  if (!checkoutUrl) {
    const error = new MollieApiError(
      `[payments] Mollie created ${payment.id} without a checkout link`,
      201,
      false
    );
    console.error(error.message);
    throw error;
  }
  return { ...payment, checkoutUrl };
}

/** `GET /v2/payments/{id}`, or `null` when Mollie does not know it (404). */
export async function getPayment(
  mollie: MollieClient,
  id: string
): Promise<MolliePayment | null> {
  return await paymentRequest(mollie, paymentPath(id), {
    method: "GET",
    nullOn404: true,
  });
}

/**
 * `DELETE /v2/payments/{id}`: cancels a payment while `isCancelable`.
 * Mollie answers 422 otherwise (`MollieApiError`, not retryable).
 */
export async function cancelPayment(
  mollie: MollieClient,
  id: string
): Promise<MolliePayment> {
  return await paymentRequest(mollie, paymentPath(id), { method: "DELETE" });
}
