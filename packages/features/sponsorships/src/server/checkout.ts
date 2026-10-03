/**
 * `sponsorships.checkout` (S-11, rulings 2, 5 and 10). In order:
 * 1. no Mollie key → `INVALID_STATE paymentsUnavailable`, nothing written;
 * 2. a repeat of the same `checkoutId` → the same answer while the payment
 *    is open (`INVALID_STATE alreadySettled` after);
 * 3. the price (`priceSponsorship`) against the client's
 *    `expectedTotalCents` → `PAYMENT_MISMATCH`;
 * 4. unknown or unpublished gestures → `GESTURE_UNAVAILABLE` (bug 39);
 * 5. the logo object (`verifyLogoObject`) → `INVALID_STATE logoInvalid`;
 * 6. one D1 batch: the sponsor, the invoice request, n sponsorships
 *    (`awaiting_payment`), the payment (`initial`, `open`, id =
 *    `checkoutId`), n items and n `created` events. The partial unique
 *    index decides availability: a violation is `GESTURE_UNAVAILABLE` with
 *    the ids read again (D1 does not name the row);
 * 7. the Mollie payment (`startMolliePayment`), which compensates on a
 *    failure → `INVALID_STATE paymentProvider`.
 */
import { ORPCError } from "@orpc/server";
import type { Locale } from "@smog/config/constants";
import { MOLLIE_DEFAULT_API_URL } from "@smog/config/env/worker";
import {
  gesture,
  inList,
  invoiceRequest,
  payment,
  paymentItem,
  type Statement,
  sponsor,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { createMollie, type MollieClient } from "@smog/payments";
import type { RpcEnv } from "@smog/rpc";
import { newId } from "@smog/utils";
import { and, eq, isNotNull } from "drizzle-orm";
import { priceSponsorship } from "../schema/pricing";
import type { InvalidStateReason } from "../schema/status";
import type { CheckoutInput, CheckoutResult } from "../schema/wizard";
import { getAvailability } from "./availability";
import { verifyLogoObject } from "./logo";
import { PaymentProviderError, startMolliePayment } from "./mollie-payment";
import type { SponsorshipsDeps, SponsorshipsImplementer } from "./procedure";
import { isGestureTaken } from "./statements";
import { eventStatement } from "./transition";

const PAYMENT_TAKEN = "UNIQUE constraint failed: payment.id";

/** A typed `INVALID_STATE` with its reason. */
function invalidState(
  reason: InvalidStateReason
): ORPCError<"INVALID_STATE", { reason: InvalidStateReason }> {
  return new ORPCError("INVALID_STATE", {
    data: { reason },
    defined: true,
    status: 409,
  });
}

function gestureUnavailable(gestureIds: string[]) {
  return new ORPCError("GESTURE_UNAVAILABLE", {
    data: { gestureIds },
    defined: true,
    status: 409,
  });
}

/** The Mollie client of this request, or `null` without a key. */
export function mollieFor(
  env: RpcEnv,
  deps: SponsorshipsDeps
): MollieClient | null {
  return createMollie(env, { fetch: deps.mollieFetch });
}

/**
 * Whether Mollie can reach a `localhost` webhook: only the local Mollie
 * fake can (dev, `MOLLIE_API_URL` not the real API).
 */
function allowFakeWebhook(env: RpcEnv): boolean {
  if (env.ENVIRONMENT !== "dev") {
    return false;
  }
  try {
    return new URL(env.MOLLIE_API_URL).origin !== MOLLIE_DEFAULT_API_URL;
  } catch {
    return false;
  }
}

function isPaymentTaken(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes(PAYMENT_TAKEN)) {
      return true;
    }
  }
  return false;
}

interface ExistingPayment {
  amountCents: number;
  checkoutUrl: string | null;
  items: { sponsorshipId: string }[];
  kind: "initial" | "renewal";
  locale: Locale;
  status: string;
}

/** The payment a previous call with this `checkoutId` wrote, if any. */
async function existingPayment(
  db: Db,
  paymentId: string
): Promise<ExistingPayment | null> {
  const rows = await db
    .select({
      amountCents: payment.amountCents,
      checkoutUrl: payment.checkoutUrl,
      kind: payment.kind,
      locale: sponsor.locale,
      sponsorshipId: paymentItem.sponsorshipId,
      status: payment.status,
    })
    .from(payment)
    .leftJoin(paymentItem, eq(paymentItem.paymentId, payment.id))
    .leftJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
    .leftJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
    .where(eq(payment.id, paymentId));
  const [first] = rows;
  if (!first) {
    return null;
  }
  return {
    amountCents: first.amountCents,
    checkoutUrl: first.checkoutUrl,
    items: rows.flatMap((row) =>
      row.sponsorshipId ? [{ sponsorshipId: row.sponsorshipId }] : []
    ),
    kind: first.kind,
    locale: first.locale ?? "nl",
    status: first.status,
  };
}

interface CheckoutRun {
  db: Db;
  env: RpcEnv;
  mollie: MollieClient;
  now: Date;
}

/** Creates (or re-reads) the Mollie payment and answers its checkout URL. */
async function startPayment(
  run: CheckoutRun,
  paymentId: string,
  existing: ExistingPayment
): Promise<CheckoutResult> {
  try {
    const { checkoutUrl } = await startMolliePayment(run.db, run.mollie, {
      allowFakeWebhook: allowFakeWebhook(run.env),
      items: existing.items,
      locale: existing.locale,
      now: run.now,
      payment: {
        amountCents: existing.amountCents,
        id: paymentId,
        kind: existing.kind,
      },
      siteUrl: run.env.SITE_URL,
    });
    return { checkoutUrl, paymentId };
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      throw invalidState("paymentProvider");
    }
    throw error;
  }
}

/**
 * A repeat of a `checkoutId` (a double click, a retry after a timeout):
 * the open payment's checkout URL; Mollie's `Idempotency-Key` makes a
 * repeat create (the first call is still on its way) return the same
 * payment. Anything else is `alreadySettled`.
 */
async function replay(
  run: CheckoutRun,
  paymentId: string,
  existing: ExistingPayment
): Promise<CheckoutResult> {
  if (existing.kind !== "initial" || existing.status !== "open") {
    throw invalidState("alreadySettled");
  }
  if (existing.checkoutUrl) {
    return { checkoutUrl: existing.checkoutUrl, paymentId };
  }
  return await startPayment(run, paymentId, existing);
}

/** The ids among `gestureIds` that are unknown or unpublished. */
async function unpublished(
  db: Db,
  gestureIds: readonly string[]
): Promise<string[]> {
  const rows = await db
    .select({ id: gesture.id })
    .from(gesture)
    .where(and(inList(gesture.id, gestureIds), isNotNull(gesture.publishedAt)));
  const published = new Set(rows.map((row) => row.id));
  return gestureIds.filter((id) => !published.has(id));
}

/** The checkout's one batch (ruling 5). */
function checkoutStatements(
  db: Db,
  input: CheckoutInput,
  now: Date
): { amountCents: number; sponsorshipIds: string[]; statements: Statement[] } {
  const logo = input.logoKey !== undefined;
  const price = priceSponsorship({ count: input.gestureIds.length, logo });
  const paymentId = input.checkoutId;
  const sponsorId = newId();
  const sponsorshipIds = input.gestureIds.map(() => newId());
  const statements: Statement[] = [
    // First, so a concurrent repeat of the same checkout fails here.
    db.insert(payment).values({
      amountCents: price.totalCents,
      createdAt: now,
      id: paymentId,
      kind: "initial",
      status: "open",
      updatedAt: now,
    }),
    db.insert(sponsor).values({
      company: input.contact.company ?? null,
      createdAt: now,
      email: input.contact.email,
      id: sponsorId,
      locale: input.locale,
      name: input.contact.name,
    }),
  ];
  if (input.invoice) {
    statements.push(
      db.insert(invoiceRequest).values({
        email: input.invoice.email,
        name: input.invoice.name,
        sponsorId,
        vatNumber: input.invoice.vatNumber,
      })
    );
  }
  input.gestureIds.forEach((gestureId, index) => {
    const sponsorshipId = sponsorshipIds[index] as string;
    const item = price.items[index] ?? {
      amountCents: price.perGestureCents,
      includesLogo: logo,
    };
    statements.push(
      // A new row starts in `awaiting_payment`; every later status change
      // goes through `transitionStatements`.
      db.insert(sponsorship).values({
        createdAt: now,
        displayName: input.displayName,
        gestureId,
        id: sponsorshipId,
        logoKey: input.logoKey ?? null,
        sponsorId,
        status: "awaiting_payment",
        updatedAt: now,
      }),
      db.insert(paymentItem).values({
        amountCents: item.amountCents,
        includesLogo: item.includesLogo,
        paymentId,
        sponsorshipId,
      }),
      eventStatement(db, {
        actorId: null,
        data: { paymentId },
        now,
        sponsorshipId,
        type: "created",
      })
    );
  });
  return { amountCents: price.totalCents, sponsorshipIds, statements };
}

/** Runs the checkout (see the module comment). */
async function runCheckout(
  db: Db,
  env: RpcEnv,
  deps: SponsorshipsDeps,
  input: CheckoutInput
): Promise<CheckoutResult> {
  const mollie = mollieFor(env, deps);
  if (!mollie) {
    throw invalidState("paymentsUnavailable");
  }
  const run: CheckoutRun = { db, env, mollie, now: new Date() };
  const paymentId = input.checkoutId;
  const previous = await existingPayment(db, paymentId);
  if (previous) {
    return await replay(run, paymentId, previous);
  }
  const { totalCents } = priceSponsorship({
    count: input.gestureIds.length,
    logo: input.logoKey !== undefined,
  });
  if (totalCents !== input.expectedTotalCents) {
    throw new ORPCError("PAYMENT_MISMATCH", { defined: true, status: 409 });
  }
  const missing = await unpublished(db, input.gestureIds);
  if (missing.length > 0) {
    throw gestureUnavailable(missing);
  }
  if (input.logoKey !== undefined) {
    if (!env.MEDIA) {
      console.error(
        "[sponsorships] The MEDIA binding is missing: the logo cannot be verified"
      );
      throw invalidState("logoInvalid");
    }
    if (!(await verifyLogoObject(env.MEDIA, input.logoKey))) {
      throw invalidState("logoInvalid");
    }
  }
  const plan = checkoutStatements(db, input, run.now);
  const [first, ...rest] = plan.statements;
  try {
    if (first) {
      await db.batch([first, ...rest]);
    }
  } catch (error) {
    if (!(isGestureTaken(error) || isPaymentTaken(error))) {
      console.error("[sponsorships] Failed to write the checkout:", error);
      throw error;
    }
    // A concurrent repeat of this checkout won: answer as a repeat.
    const winner = await existingPayment(db, paymentId);
    if (winner) {
      return await replay(run, paymentId, winner);
    }
    const taken = (await getAvailability(db, input.gestureIds))
      .filter((item) => item.state !== "available")
      .map((item) => item.gestureId);
    throw gestureUnavailable(taken.length > 0 ? taken : input.gestureIds);
  }
  return await startPayment(run, paymentId, {
    amountCents: plan.amountCents,
    checkoutUrl: null,
    items: plan.sponsorshipIds.map((sponsorshipId) => ({ sponsorshipId })),
    kind: "initial",
    locale: input.locale,
    status: "open",
  });
}

/** `sponsorships.checkout` (ruling 5): Turnstile and `RL_SPONSOR` (the guards). */
export function checkoutProcedures(
  os: SponsorshipsImplementer,
  deps: SponsorshipsDeps
) {
  return {
    checkout: os.checkout.handler(
      async ({ context, input }) =>
        await runCheckout(context.db, context.env, deps, input)
    ),
  };
}
