/**
 * Reading a re-edit or renewal link (ruling 11): the raw token is hashed
 * and looked up with its purpose. Unknown, used or of the other purpose
 * is `invalid`; past `expires_at` is `expired` (the page says when). The
 * raw token is never stored, logged or compared in SQL as itself.
 */
import {
  failWhen,
  gesture,
  paymentItem,
  ref,
  type SponsorshipTokenPurpose,
  type Statement,
  sponsor,
  sponsorship,
  sponsorshipToken,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, eq, isNull, sql } from "drizzle-orm";
import { hashSponsorshipToken } from "../schema/tokens";

export interface LinkSponsorship {
  displayName: string;
  endsAt: Date | null;
  gestureName: string;
  gestureSlug: string;
  /**
   * Whether a logo was paid for (`payment_item.includes_logo`; fix round 1,
   * I-1). The key may be gone (the purge released it) while this holds:
   * the re-edit then takes a new logo.
   */
  hasLogo: boolean;
  id: string;
  logoKey: string | null;
  sponsorLocale: "nl" | "en" | "fr";
  status: typeof sponsorship.$inferSelect.status;
}

export type TokenLink =
  | { kind: "invalid" }
  | { expiresAt: Date; kind: "expired" }
  | {
      expiresAt: Date;
      kind: "open";
      sponsorship: LinkSponsorship;
      tokenId: string;
    };

/** The link `raw` opens for `purpose` at `now`. */
export async function readTokenLink(
  db: Db,
  input: { now: Date; purpose: SponsorshipTokenPurpose; raw: string }
): Promise<TokenLink> {
  const hash = await hashSponsorshipToken(input.raw);
  const [row] = await db
    .select({
      displayName: sponsorship.displayName,
      endsAt: sponsorship.endsAt,
      expiresAt: sponsorshipToken.expiresAt,
      gestureName: gesture.name,
      gestureSlug: gesture.slug,
      hasLogo: sql<number>`EXISTS (SELECT 1 FROM ${paymentItem} AS ${sql.raw("pi")} WHERE ${ref("pi", paymentItem.sponsorshipId)} = ${ref("sponsorship", sponsorship.id)} AND ${ref("pi", paymentItem.includesLogo)} = 1)`,
      id: sponsorship.id,
      logoKey: sponsorship.logoKey,
      purpose: sponsorshipToken.purpose,
      sponsorLocale: sponsor.locale,
      status: sponsorship.status,
      tokenId: sponsorshipToken.id,
      usedAt: sponsorshipToken.usedAt,
    })
    .from(sponsorshipToken)
    .innerJoin(sponsorship, eq(sponsorship.id, sponsorshipToken.sponsorshipId))
    .innerJoin(gesture, eq(gesture.id, sponsorship.gestureId))
    .innerJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
    .where(eq(sponsorshipToken.tokenHash, hash))
    .limit(1);
  if (!row || row.purpose !== input.purpose || row.usedAt !== null) {
    return { kind: "invalid" };
  }
  if (row.expiresAt.getTime() <= input.now.getTime()) {
    return { expiresAt: row.expiresAt, kind: "expired" };
  }
  return {
    expiresAt: row.expiresAt,
    kind: "open",
    sponsorship: {
      displayName: row.displayName,
      endsAt: row.endsAt,
      gestureName: row.gestureName,
      gestureSlug: row.gestureSlug,
      hasLogo: Boolean(row.hasLogo),
      id: row.id,
      logoKey: row.logoKey,
      sponsorLocale: row.sponsorLocale,
      status: row.status,
    },
    tokenId: row.tokenId,
  };
}

/** The guard name of a link used (or expired) since it was read. */
const TOKEN_USED_GUARD = "token-used";

/** Whether a batch failed because its link was used or expired meanwhile. */
export function isTokenUsed(error: unknown): boolean {
  return toGuardFailure(error)?.guard === TOKEN_USED_GUARD;
}

/**
 * `[guard, update]`: fails the batch unless the token is still open at
 * `now`, then marks it used. Two submits of one link: one wins.
 */
export function consumeTokenStatements(
  db: Db,
  input: { now: Date; tokenId: string }
): [Statement, Statement] {
  const { now, tokenId } = input;
  return [
    failWhen(
      db,
      TOKEN_USED_GUARD,
      sql`NOT EXISTS (SELECT 1 FROM ${sponsorshipToken} WHERE ${sponsorshipToken.id} = ${tokenId} AND ${sponsorshipToken.usedAt} IS NULL AND ${sponsorshipToken.expiresAt} > ${now.getTime()})`
    ),
    db
      .update(sponsorshipToken)
      .set({ usedAt: now })
      .where(
        and(eq(sponsorshipToken.id, tokenId), isNull(sponsorshipToken.usedAt))
      ),
  ];
}
