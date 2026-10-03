/**
 * `sponsorships.renewal.*` (S-20, ruling 11): the link the reminder sweep
 * sends (it expires at `ends_at`, single use). The checkout creates a
 * `renewal` payment for one more year at `priceSponsorship` (one item,
 * `includes_logo` from `logo_key`) and its Mollie checkout. The token is
 * used only when that payment settles paid (`renewStatements`), so a
 * failed or abandoned payment can be retried with the same link. One open
 * renewal payment per sponsorship: another checkout answers the open one.
 */

import type { Locale } from "@smog/config/constants";
import {
  MOLLIE_DEFAULT_API_URL,
  type WorkerEnv,
} from "@smog/config/env/worker";
import {
  failWhen,
  inList,
  payment,
  paymentItem,
  type Statement,
  sponsorship,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { createMollie, type MollieClient } from "@smog/payments";
import { and, desc, eq, sql } from "drizzle-orm";
import { priceSponsorship } from "../schema/pricing";
import type { CheckoutResult } from "../schema/wizard";
import { PaymentProviderError, startMolliePayment } from "./mollie-payment";
import type { SponsorshipsDeps, SponsorshipsImplementer } from "./procedure";
import { invalidState, requireOpen } from "./refusals";
import { isRenewable } from "./settle";
import { type LinkSponsorship, readTokenLink } from "./token-link";
import { STALE_GUARD } from "./transition";

/** Another renewal payment of the sponsorship is open. */
const RENEWAL_OPEN_GUARD = "renewal-open";
const PAYMENT_ID_TAKEN = "UNIQUE constraint failed: payment.id";

/** One more year of `sponsorship`, in cents (a renewal is priced per gesture). */
function renewalPrice(link: LinkSponsorship) {
  const includesLogo = link.logoKey !== null;
  const [item] = priceSponsorship({ count: 1, logo: includesLogo }).items;
  return { amountCents: item?.amountCents ?? 0, includesLogo };
}

/** The open renewal link of a sponsorship that can still be renewed. */
async function openRenewalLink(db: Db, raw: string, now: Date) {
  const link = requireOpen(
    await readTokenLink(db, { now, purpose: "renewal", raw })
  );
  if (!isRenewable(link.sponsorship.status)) {
    throw invalidState("notRenewable");
  }
  return link;
}

/**
 * The checkout of the sponsorship's open renewal payment, `null` when it
 * has none. An open one without its Mollie checkout yet is being created
 * (or that crashed, and the stale sweep cancels it within 24 h).
 */
async function openRenewal(
  db: Db,
  sponsorshipId: string
): Promise<CheckoutResult | null> {
  const [row] = await db
    .select({ checkoutUrl: payment.checkoutUrl, id: payment.id })
    .from(paymentItem)
    .innerJoin(payment, eq(payment.id, paymentItem.paymentId))
    .where(
      and(
        eq(paymentItem.sponsorshipId, sponsorshipId),
        eq(payment.kind, "renewal"),
        eq(payment.status, "open")
      )
    )
    .orderBy(desc(payment.createdAt))
    .limit(1);
  if (!row) {
    return null;
  }
  if (!row.checkoutUrl) {
    throw invalidState("paymentProvider");
  }
  return { checkoutUrl: row.checkoutUrl, paymentId: row.id };
}

/** The statements of a new renewal payment, guarded for one open per sponsorship. */
function createStatements(
  db: Db,
  input: {
    amountCents: number;
    checkoutId: string;
    includesLogo: boolean;
    now: Date;
    sponsorshipId: string;
  }
): Statement[] {
  const { amountCents, checkoutId, includesLogo, now, sponsorshipId } = input;
  return [
    failWhen(
      db,
      STALE_GUARD,
      sql`NOT EXISTS (SELECT 1 FROM ${sponsorship} WHERE ${sponsorship.id} = ${sponsorshipId} AND ${inList(sponsorship.status, ["live", "expiring"])})`
    ),
    failWhen(
      db,
      RENEWAL_OPEN_GUARD,
      sql`EXISTS (SELECT 1 FROM ${paymentItem} INNER JOIN ${payment} ON ${payment.id} = ${paymentItem.paymentId} WHERE ${paymentItem.sponsorshipId} = ${sponsorshipId} AND ${payment.kind} = 'renewal' AND ${payment.status} = 'open')`
    ),
    db.insert(payment).values({
      amountCents,
      createdAt: now,
      id: checkoutId,
      kind: "renewal",
      status: "open",
      updatedAt: now,
    }),
    db.insert(paymentItem).values({
      amountCents,
      includesLogo,
      paymentId: checkoutId,
      sponsorshipId,
    }),
  ];
}

function isPaymentIdTaken(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes(PAYMENT_ID_TAKEN)) {
      return true;
    }
  }
  return false;
}

/**
 * Writes the renewal payment. A lost race answers the winner's open
 * payment (`null` when this one was written).
 */
async function writePayment(
  db: Db,
  input: { checkoutId: string; link: LinkSponsorship; now: Date }
): Promise<CheckoutResult | null> {
  const [first, ...rest] = createStatements(db, {
    ...renewalPrice(input.link),
    checkoutId: input.checkoutId,
    now: input.now,
    sponsorshipId: input.link.id,
  });
  try {
    if (first) {
      await db.batch([first, ...rest]);
    }
    return null;
  } catch (error) {
    const guard = toGuardFailure(error)?.guard;
    if (guard === STALE_GUARD) {
      throw invalidState("notRenewable");
    }
    if (guard === RENEWAL_OPEN_GUARD || isPaymentIdTaken(error)) {
      const winner = await openRenewal(db, input.link.id);
      if (winner) {
        return winner;
      }
      throw invalidState("stale");
    }
    throw error;
  }
}

/** Whether Mollie can reach a localhost webhook: only the local fake (ruling 2). */
function allowFakeWebhook(env: WorkerEnv): boolean {
  const apiUrl = env.MOLLIE_API_URL;
  return (
    env.ENVIRONMENT === "dev" &&
    Boolean(apiUrl) &&
    apiUrl !== MOLLIE_DEFAULT_API_URL
  );
}

async function renewalCheckout(
  context: { db: Db; env: WorkerEnv; locale: Locale },
  mollie: MollieClient,
  input: { checkoutId: string; token: string }
): Promise<CheckoutResult> {
  const { db } = context;
  const now = new Date();
  const link = requireOpen(
    await readTokenLink(db, { now, purpose: "renewal", raw: input.token })
  );
  const target = link.sponsorship;
  const [existing] = await db
    .select({ status: payment.status })
    .from(payment)
    .where(eq(payment.id, input.checkoutId))
    .limit(1);
  if (existing) {
    // A repeat of this checkout: its checkout while open, else settled.
    const open =
      existing.status === "open" ? await openRenewal(db, target.id) : null;
    if (open?.paymentId !== input.checkoutId) {
      throw invalidState("alreadySettled");
    }
    return open;
  }
  if (!isRenewable(target.status)) {
    throw invalidState("notRenewable");
  }
  const open =
    (await openRenewal(db, target.id)) ??
    (await writePayment(db, {
      checkoutId: input.checkoutId,
      link: target,
      now,
    }));
  if (open) {
    return open;
  }
  try {
    const created = await startMolliePayment(db, mollie, {
      allowFakeWebhook: allowFakeWebhook(context.env),
      items: [{ sponsorshipId: target.id }],
      locale: context.locale,
      now,
      payment: {
        amountCents: renewalPrice(target).amountCents,
        id: input.checkoutId,
        kind: "renewal",
      },
      siteUrl: context.env.SITE_URL,
    });
    return { checkoutUrl: created.checkoutUrl, paymentId: input.checkoutId };
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      throw invalidState("paymentProvider");
    }
    throw error;
  }
}

export function renewalProcedures(
  os: SponsorshipsImplementer,
  deps: SponsorshipsDeps
) {
  return {
    renewal: {
      checkout: os.renewal.checkout.handler(async ({ context, input }) => {
        const mollie = createMollie(context.env, { fetch: deps.mollieFetch });
        if (!mollie) {
          // Sponsoring is paused: nothing is read or written (ruling 5).
          throw invalidState("paymentsUnavailable");
        }
        return await renewalCheckout(context, mollie, input);
      }),

      get: os.renewal.get.handler(async ({ context, input }) => {
        const link = await openRenewalLink(context.db, input.token, new Date());
        const target = link.sponsorship;
        return {
          amountCents: renewalPrice(target).amountCents,
          displayName: target.displayName,
          endsAt: target.endsAt?.getTime() ?? link.expiresAt.getTime(),
          gesture: { name: target.gestureName, slug: target.gestureSlug },
          hasLogo: target.logoKey !== null,
        };
      }),
    },
  };
}
