/**
 * `sponsorships.paymentStatus` (S-14, ruling 2): what the return page
 * polls. The page does not wait for the webhook: an `open` payment is
 * re-fetched from Mollie and settled with `settlePayment`, the webhook's
 * own function, at most once per 5 s per payment (a KV marker; D1 decides
 * everything, the marker only spares Mollie). The answer holds no email,
 * contact, company, invoice or Mollie data: only the display name, the
 * gestures and the amounts.
 */
import { ORPCError } from "@orpc/server";
import { gesture, payment, paymentItem, sponsorship } from "@smog/db";
import type { Db } from "@smog/db/client";
import { enqueueOutputs } from "@smog/jobs";
import { getPayment } from "@smog/payments";
import { MOLLIE_PAYMENT_ID } from "@smog/payments/schema";
import type { RpcContext } from "@smog/rpc";
import { asc, eq } from "drizzle-orm";
import type { PaymentStatusView } from "../schema/status";
import { mollieFor } from "./checkout";
import { markFanout } from "./fanout-marker";

import type { SponsorshipsDeps, SponsorshipsImplementer } from "./procedure";
import { settlePayment } from "./settle";

/** At most one Mollie re-fetch per payment in this window. */
const STATUS_REFETCH_INTERVAL_MS = 5000;
/** KV's shortest TTL; the marker's timestamp decides the 5 s. */
const MARKER_TTL_S = 60;

function markerKey(paymentId: string): string {
  return `sponsorships:status-refetch:${paymentId}`;
}

interface PaymentRef {
  id: string;
  mollieId: string | null;
  status: string;
}

async function findPayment(db: Db, ref: string): Promise<PaymentRef | null> {
  const column = MOLLIE_PAYMENT_ID.test(ref) ? payment.mollieId : payment.id;
  const [row] = await db
    .select({
      id: payment.id,
      mollieId: payment.mollieId,
      status: payment.status,
    })
    .from(payment)
    .where(eq(column, ref))
    .limit(1);
  return row ?? null;
}

/**
 * Claims this payment's re-fetch for the next 5 s; `false` when another
 * poll did in that window. A KV failure is logged and allows the re-fetch.
 */
async function claimRefetch(
  kv: KVNamespace,
  paymentId: string,
  now: number
): Promise<boolean> {
  try {
    const last = await kv.get(markerKey(paymentId));
    const at = last === null ? Number.NaN : Number.parseInt(last, 10);
    if (Number.isFinite(at) && now - at < STATUS_REFETCH_INTERVAL_MS) {
      return false;
    }
    await kv.put(markerKey(paymentId), String(now), {
      expirationTtl: MARKER_TTL_S,
    });
  } catch (error) {
    console.error("[sponsorships] Failed to read the status marker:", error);
  }
  return true;
}

/**
 * Re-fetches an open payment and settles it, then enqueues the outputs
 * (logged on a failure: the webhook re-derives them) and, once they are
 * on the queue, writes the fan-out marker (`fanout-marker.ts`). A Mollie failure is
 * logged and the stored status stands.
 */
async function refreshOpenPayment(
  context: RpcContext,
  deps: SponsorshipsDeps,
  row: PaymentRef
): Promise<void> {
  const mollie = mollieFor(context.env, deps);
  if (!(mollie && row.mollieId)) {
    return;
  }
  const now = new Date();
  if (!(await claimRefetch(context.kv, row.id, now.getTime()))) {
    return;
  }
  try {
    const fetched = await getPayment(mollie, row.mollieId);
    const result = fetched
      ? await settlePayment(context.db, { now, payment: fetched })
      : null;
    if (result) {
      const sent = await enqueueOutputs(
        {
          email: context.env.EMAIL_QUEUE,
          events: context.env.EVENTS_QUEUE,
        },
        result
      );
      if (sent && result.events.length > 0) {
        // The webhook's `already` that follows sends no second fan-out (M-2).
        await markFanout(context.kv, result.paymentId);
      }
    }
  } catch (error) {
    console.error(
      `[sponsorships] Failed to refresh payment ${row.id} from Mollie; answering the stored status:`,
      error
    );
  }
}

/** The public view of a payment (no PII beyond the display name). */
async function statusView(
  db: Db,
  paymentId: string
): Promise<PaymentStatusView> {
  const rows = await db
    .select({
      amountCents: payment.amountCents,
      displayName: sponsorship.displayName,
      endsAt: sponsorship.endsAt,
      gestureName: gesture.name,
      gestureSlug: gesture.slug,
      includesLogo: paymentItem.includesLogo,
      kind: payment.kind,
      status: payment.status,
    })
    .from(payment)
    .innerJoin(paymentItem, eq(paymentItem.paymentId, payment.id))
    .innerJoin(sponsorship, eq(sponsorship.id, paymentItem.sponsorshipId))
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .where(eq(payment.id, paymentId))
    .orderBy(asc(gesture.name), asc(sponsorship.id));
  const [first] = rows;
  if (!first) {
    throw new ORPCError("NOT_FOUND", { defined: true, status: 404 });
  }
  const renewedUntil =
    first.kind === "renewal" && first.status === "paid" && first.endsAt
      ? first.endsAt.getTime()
      : undefined;
  return {
    displayName: first.displayName,
    items: rows.map((row) => ({
      gestureName: row.gestureName,
      gestureSlug: row.gestureSlug,
      includesLogo: row.includesLogo,
    })),
    kind: first.kind,
    ...(renewedUntil === undefined ? {} : { renewedUntil }),
    status: first.status,
    totalCents: first.amountCents,
  };
}

/** `sponsorships.paymentStatus`: `RL_API` only (the guards). */
export function statusProcedures(
  os: SponsorshipsImplementer,
  deps: SponsorshipsDeps
) {
  return {
    paymentStatus: os.paymentStatus.handler(async ({ context, input }) => {
      const row = await findPayment(context.db, input.payment);
      if (!row) {
        throw new ORPCError("NOT_FOUND", { defined: true, status: 404 });
      }
      if (row.status === "open") {
        await refreshOpenPayment(context, deps, row);
      }
      return await statusView(context.db, row.id);
    }),
  };
}
