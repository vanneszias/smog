import { env as bindings } from "cloudflare:workers";
import { createDb, type Db } from "@smog/db/client";
import {
  createMollie,
  getPayment,
  type MollieClient,
  type MolliePayment,
} from "@smog/payments";
import { MOLLIE_PAYMENT_ID } from "@smog/payments/schema";
import { checkRateLimit } from "@smog/rpc";
import {
  enqueueOutputs,
  type SponsorshipQueues,
  settlePayment,
} from "@smog/sponsorships/server";
import { readCappedBody } from "@smog/utils";
import { siteEnv } from "./auth";

/**
 * The Mollie webhook (phase 6 ruling 2), shared by `POST
 * /api/webhooks/mollie` and the legacy alias `POST /webhooks/mollie`.
 *
 * Mollie POSTs `id=tr_…` (form, or JSON as the old handler accepted) and
 * signs nothing: the body is only a pointer. The payment is re-fetched
 * with our key and settled (`settlePayment`, idempotent by the stored
 * status), then every event and email of the result is enqueued, whatever
 * the outcome. Nothing is kept per request. The answers:
 * - 400: a missing or malformed id (counted);
 * - 200: an id Mollie does not know (counted), or a payment that is not
 *   ours, with nothing done;
 * - 503: no `MOLLIE_API_KEY`, a Mollie failure, or an enqueue that failed
 *   after the settle, so Mollie retries and the retry re-derives them;
 * - 500: our own processing failed (Mollie retries; settling is idempotent);
 * - 200 otherwise.
 * Only the counted answers (400 and Mollie's 404) spend the caller's
 * `RL_API` budget, so genuine retries are never throttled; past it the
 * answer is 429.
 */

/** Mollie sends one short form field; the old handler's JSON fits too. */
const MOLLIE_WEBHOOK_MAX_BYTES = 4096;

export interface MollieWebhookDeps {
  db: Db;
  /** Whether this caller may fail once more (`RL_API` per IP). */
  limit: (key: string) => Promise<boolean>;
  /** `null` without `MOLLIE_API_KEY` (staging until its key is set). */
  mollie: MollieClient | null;
  now?: () => Date;
  queues: SponsorshipQueues;
}

function answer(status: number, code: string): Response {
  return Response.json(
    { code },
    { headers: { "cache-control": "no-store" }, status }
  );
}

/** `id` from the form body, or from a JSON one. */
function paymentId(bytes: Uint8Array, contentType: string): string | null {
  const text = new TextDecoder().decode(bytes);
  let id: unknown;
  if (contentType.includes("application/json")) {
    try {
      id = (JSON.parse(text) as { id?: unknown } | null)?.id;
    } catch {
      return null;
    }
  } else {
    id = new URLSearchParams(text).get("id");
  }
  return typeof id === "string" && MOLLIE_PAYMENT_ID.test(id) ? id : null;
}

export async function handleMollieWebhook(
  request: Request,
  deps: MollieWebhookDeps
): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const counted = async (status: number, code: string): Promise<Response> =>
    (await deps.limit(`mollie-webhook:${ip}`))
      ? answer(status, code)
      : answer(429, "RATE_LIMITED");
  const body = await readCappedBody(request, MOLLIE_WEBHOOK_MAX_BYTES);
  const id = body.ok
    ? paymentId(body.bytes, request.headers.get("content-type") ?? "")
    : null;
  if (!id) {
    console.warn("[payments] Refused a Mollie webhook without a valid id");
    return await counted(body.ok ? 400 : body.status, "BAD_REQUEST");
  }
  if (!deps.mollie) {
    console.warn(
      `[payments] A Mollie webhook for ${id} arrived but MOLLIE_API_KEY is not set`
    );
    return answer(503, "NOT_CONFIGURED");
  }
  let fetched: MolliePayment | null;
  try {
    fetched = await getPayment(deps.mollie, id);
  } catch (error) {
    // `getPayment` logged it; Mollie retries the webhook.
    console.error(
      `[payments] Failed to re-fetch ${id} for its webhook:`,
      error
    );
    return answer(503, "MOLLIE_UNAVAILABLE");
  }
  if (!fetched) {
    console.warn(`[payments] A Mollie webhook for an unknown payment ${id}`);
    return await counted(200, "UNKNOWN");
  }
  const now = deps.now?.() ?? new Date();
  let result: Awaited<ReturnType<typeof settlePayment>>;
  try {
    result = await settlePayment(deps.db, { now, payment: fetched });
  } catch (error) {
    console.error(`[payments] Failed to settle ${id}:`, error);
    return answer(500, "FAILED");
  }
  if (!result) {
    console.warn(`[payments] A Mollie webhook for ${id}, which is not ours`);
    return answer(200, "NOT_OURS");
  }
  try {
    await enqueueOutputs(deps.queues, result, { onFailure: "throw" });
  } catch (error) {
    console.error(
      `[payments] Failed to enqueue the outputs of ${id} (${result.outcome}):`,
      error
    );
    return answer(503, "ENQUEUE_FAILED");
  }
  console.log(
    `[payments] Mollie webhook ${id}: ${result.outcome} (payment ${result.paymentId})`
  );
  return answer(200, "OK");
}

/**
 * The webhook as the routes serve it: this Worker's D1, its queues,
 * `RL_API` for the counted failures, and a Mollie client from env.
 * `legacy` is the old `/webhooks/mollie` path (spec §15), kept for 30 days
 * after cutover (a PROGRESS carry): never a redirect, which Mollie would
 * not follow.
 */
export async function serveMollieWebhook(
  request: Request,
  { legacy = false }: { legacy?: boolean } = {}
): Promise<Response> {
  if (legacy) {
    console.warn("[mollie] legacy webhook path used");
  }
  const { db, rateLimits, worker } = siteEnv();
  return await handleMollieWebhook(request, {
    db: createDb(db),
    limit: (key) => checkRateLimit(rateLimits.RL_API, key),
    mollie: createMollie(worker),
    queues: { email: bindings.EMAIL_QUEUE, events: bindings.EVENTS_QUEUE },
  });
}
