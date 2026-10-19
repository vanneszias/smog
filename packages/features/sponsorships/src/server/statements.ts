/**
 * The batch statements the sponsorship services share: the payment guard,
 * the refunded amount, and the re-edit / renewal tokens. Status changes are
 * `./transition`'s alone.
 */
import {
  failWhen,
  inList,
  type PaymentStatus,
  payment,
  type SponsorshipTokenPurpose,
  type Statement,
  sponsorshipToken,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { newId } from "@smog/utils";
import { and, eq, isNull, sql } from "drizzle-orm";
import { newSponsorshipToken } from "../schema/tokens";
import { eventStatement } from "./transition";

/** The guard name of a payment whose status moved on. */
export const PAYMENT_STALE_GUARD = "payment-stale";

/** Whether a batch failed because its payment's status moved on. */
export function isStalePayment(error: unknown): boolean {
  return toGuardFailure(error)?.guard === PAYMENT_STALE_GUARD;
}

/**
 * Fails the batch unless the payment still has one of `statuses` (the
 * idempotence of `settlePayment` and the admin's payment actions).
 */
export function paymentGuard(
  db: Db,
  paymentId: string,
  statuses: readonly PaymentStatus[]
): Statement {
  return failWhen(
    db,
    PAYMENT_STALE_GUARD,
    sql`NOT EXISTS (SELECT 1 FROM ${payment} WHERE ${payment.id} = ${paymentId} AND ${inList(payment.status, statuses)})`
  );
}

/**
 * Stores Mollie's `amountRefunded` (ruling 4); `refunded_at` keeps the
 * first time a refund was seen.
 */
export function refundStatement(
  db: Db,
  input: { now: Date; paymentId: string; refundedCents: number }
): Statement {
  return db
    .update(payment)
    .set({
      ...(input.refundedCents > 0
        ? {
            refundedAt: sql`coalesce(${payment.refundedAt}, ${input.now.getTime()})`,
          }
        : {}),
      refundedCents: input.refundedCents,
      updatedAt: input.now,
    })
    .where(eq(payment.id, input.paymentId));
}

/** Marks every open token of `purpose` used (single use, ruling 11). */
export function revokeTokensStatement(
  db: Db,
  input: { now: Date; purpose: SponsorshipTokenPurpose; sponsorshipId: string }
): Statement {
  return db
    .update(sponsorshipToken)
    .set({ usedAt: input.now })
    .where(
      and(
        eq(sponsorshipToken.sponsorshipId, input.sponsorshipId),
        eq(sponsorshipToken.purpose, input.purpose),
        isNull(sponsorshipToken.usedAt)
      )
    );
}

/**
 * Marks every open token of the sponsorship used, whatever its purpose:
 * an admin ending it (force expire, reject, cancel) leaves no link that
 * still opens (phase 6 close-out). The link then reads as `invalid`.
 */
export function revokeAllTokensStatement(
  db: Db,
  input: { now: Date; sponsorshipId: string }
): Statement {
  return db
    .update(sponsorshipToken)
    .set({ usedAt: input.now })
    .where(
      and(
        eq(sponsorshipToken.sponsorshipId, input.sponsorshipId),
        isNull(sponsorshipToken.usedAt)
      )
    );
}

export interface IssuedToken {
  expiresAt: Date;
  /** The `token_issued` event and the token row, after the revocation. */
  statements: Statement[];
  /** The raw token: for the link only, never stored. */
  token: string;
  tokenId: string;
}

/**
 * Revokes the open tokens of `purpose`, inserts a new one (its hash only)
 * and the `token_issued` event, in that order, for one batch.
 */
export async function issueTokenStatements(
  db: Db,
  input: {
    actorId: string | null;
    expiresAt: Date;
    now: Date;
    purpose: SponsorshipTokenPurpose;
    sponsorshipId: string;
  }
): Promise<IssuedToken> {
  const { actorId, expiresAt, now, purpose, sponsorshipId } = input;
  const { hash, token } = await newSponsorshipToken();
  const tokenId = newId();
  return {
    expiresAt,
    statements: [
      revokeTokensStatement(db, { now, purpose, sponsorshipId }),
      db.insert(sponsorshipToken).values({
        createdAt: now,
        expiresAt,
        id: tokenId,
        purpose,
        sponsorshipId,
        tokenHash: hash,
      }),
      eventStatement(db, {
        actorId,
        data: { expiresAt: expiresAt.toISOString(), purpose, tokenId },
        now,
        sponsorshipId,
        type: "token_issued",
      }),
    ],
    token,
    tokenId,
  };
}

const GESTURE_TAKEN = "UNIQUE constraint failed: sponsorship.gesture_id";

/**
 * Whether a batch failed on `sponsorship_gesture_blocking_uq`: another
 * blocking sponsorship holds the gesture. The partial unique index is the
 * only availability check that decides anything (ruling 5).
 */
export function isGestureTaken(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes(GESTURE_TAKEN)) {
      return true;
    }
  }
  return false;
}
