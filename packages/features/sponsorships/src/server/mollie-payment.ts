/**
 * Creating the Mollie payment for one of ours (rulings 2 and 5), after the
 * batch that wrote it, since Mollie needs our payment id. On success the
 * Mollie id and the checkout URL are stored. If Mollie fails, a
 * compensating batch frees what the checkout took: an initial payment is
 * `failed` and its `awaiting_payment` items `cancelled` (`{ reason:
 * "provider" }`), so the gestures are free again; a renewal payment is
 * only marked `failed`. The caller answers `INVALID_STATE paymentProvider`.
 * A crash between the two leaves an `open` payment without `mollie_id`,
 * which the 24 h stale sweep cancels.
 */
import type { Locale } from "@smog/config/constants";
import {
  MOLLIE_DEFAULT_API_URL,
  type WorkerEnv,
} from "@smog/config/env/worker";
import {
  type PaymentKind,
  payment,
  paymentItem,
  type Statement,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { createI18n } from "@smog/i18n";
import { createPayment, type MollieClient } from "@smog/payments";
import { and, eq, isNull } from "drizzle-orm";
import { paymentGuard } from "./statements";
import { transitionStatements } from "./transition";

const PAYMENT_ID_TAKEN = "UNIQUE constraint failed: payment.id";

/**
 * Whether a batch failed because the payment id (the client's
 * `checkoutId`) exists already: a concurrent repeat of the same checkout.
 */
export function isPaymentIdTaken(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes(PAYMENT_ID_TAKEN)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether Mollie can reach a `localhost` webhook: only the local Mollie
 * fake can (dev, `MOLLIE_API_URL` not the real API; ruling 2).
 */
export function allowFakeWebhook(
  env: Pick<WorkerEnv, "ENVIRONMENT" | "MOLLIE_API_URL">
): boolean {
  if (env.ENVIRONMENT !== "dev") {
    return false;
  }
  try {
    return new URL(env.MOLLIE_API_URL).origin !== MOLLIE_DEFAULT_API_URL;
  } catch {
    return false;
  }
}

/** Mollie could not create the payment; the compensation has run. */
export class PaymentProviderError extends Error {
  readonly paymentId: string;

  constructor(paymentId: string, options: { cause: unknown }) {
    super(
      `[sponsorships] Mollie could not create the payment for ${paymentId}`,
      options
    );
    this.paymentId = paymentId;
    this.name = "PaymentProviderError";
  }
}

export interface StartMolliePaymentInput {
  /**
   * Whether Mollie can reach a `localhost` webhook: true only when
   * `MOLLIE_API_URL` points at the local fake (ruling 2).
   */
  allowFakeWebhook: boolean;
  /** The payment's sponsorships (the description counts them). */
  items: readonly { sponsorshipId: string }[];
  locale: Locale;
  now: Date;
  payment: { amountCents: number; id: string; kind: PaymentKind };
  /** `SITE_URL`, for the redirect and the webhook. */
  siteUrl: string;
}

const TRAILING_SLASHES = /\/+$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `/api/webhooks/mollie`, left out where Mollie cannot reach it. */
function webhookUrl(siteUrl: string, allowFake: boolean): string | undefined {
  const local = LOCAL_HOSTS.has(new URL(siteUrl).hostname);
  return local && !allowFake ? undefined : `${siteUrl}/api/webhooks/mollie`;
}

function description(input: StartMolliePaymentInput): string {
  const { t } = createI18n(input.locale);
  return input.payment.kind === "renewal"
    ? t("sponsorship.mollie.renewal")
    : t("sponsorship.mollie.description", { count: input.items.length });
}

/** The compensation of a failed create (see the module comment). */
function compensation(
  db: Db,
  input: StartMolliePaymentInput,
  statuses: { sponsorshipId: string; status: string }[]
): Statement[] {
  const { now } = input;
  const paymentId = input.payment.id;
  return [
    paymentGuard(db, paymentId, ["open"]),
    db
      .update(payment)
      .set({ status: "failed", updatedAt: now })
      .where(eq(payment.id, paymentId)),
    ...(input.payment.kind === "initial"
      ? statuses
          .filter((item) => item.status === "awaiting_payment")
          .flatMap((item) =>
            transitionStatements(db, {
              actorId: null,
              data: { paymentId, reason: "provider" },
              event: "cancelled",
              from: "awaiting_payment",
              now,
              sponsorshipId: item.sponsorshipId,
            })
          )
      : []),
  ];
}

async function compensate(
  db: Db,
  input: StartMolliePaymentInput
): Promise<void> {
  const statuses = await db
    .select({ sponsorshipId: sponsorship.id, status: sponsorship.status })
    .from(paymentItem)
    .innerJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
    .where(eq(paymentItem.paymentId, input.payment.id));
  const [first, ...rest] = compensation(db, input, statuses);
  if (first) {
    await db.batch([first, ...rest]);
  }
}

/**
 * `POST /v2/payments` for our payment, then stores `mollie_id` and
 * `checkout_url`; on a Mollie failure runs the compensation and throws
 * `PaymentProviderError`. Returns Mollie's id and the checkout URL.
 */
export async function startMolliePayment(
  db: Db,
  mollie: MollieClient,
  input: StartMolliePaymentInput
): Promise<{ checkoutUrl: string; mollieId: string }> {
  const siteUrl = input.siteUrl.replace(TRAILING_SLASHES, "");
  const { amountCents, id, kind } = input.payment;
  let created: { checkoutUrl: string; id: string };
  try {
    created = await createPayment(mollie, {
      amountCents,
      description: description(input),
      idempotencyKey: id,
      locale: input.locale,
      metadata: { kind, paymentId: id },
      redirectUrl: `${siteUrl}/sponsor/success?payment=${encodeURIComponent(id)}`,
      webhookUrl: webhookUrl(siteUrl, input.allowFakeWebhook),
    });
  } catch (error) {
    console.error(
      `[sponsorships] Failed to create the Mollie payment for ${id}; compensating:`,
      error
    );
    try {
      await compensate(db, input);
    } catch (compensationError) {
      // The stale sweep cancels the open payment within 24 h.
      console.error(
        `[sponsorships] Failed to compensate payment ${id}:`,
        compensationError
      );
    }
    throw new PaymentProviderError(id, { cause: error });
  }
  await db
    .update(payment)
    .set({
      checkoutUrl: created.checkoutUrl,
      mollieId: created.id,
      updatedAt: input.now,
    })
    .where(and(eq(payment.id, id), isNull(payment.mollieId)));
  return { checkoutUrl: created.checkoutUrl, mollieId: created.id };
}
