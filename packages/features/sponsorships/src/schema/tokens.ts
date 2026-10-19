/**
 * Re-edit and renewal links (ruling 11). The raw token is 32 random bytes
 * in base64url (43 characters) and appears only in the link; only its
 * SHA-256 (lowercase hex, Web Crypto) is stored. The old system's UUID
 * re-edit tokens are migrated as the SHA-256 of the raw UUID (spec §15), so
 * the schema accepts both shapes. Phase 8's migration script imports
 * `hashSponsorshipToken` from here.
 */
import { DAY_MS, newToken, sha256Hex } from "@smog/utils";
import { z } from "zod";
import { displayNameSchema, logoKeySchema } from "./wizard";

/** A re-edit link is valid for 7 days (S-19). */
export const REEDIT_TOKEN_TTL_MS = 7 * DAY_MS;

const NEW_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A token from a link: a new base64url token or an old UUID one. */
export const sponsorshipTokenSchema = z.union([
  z.string().regex(NEW_TOKEN),
  z.uuid(),
]);

/** The stored form of a token: its SHA-256 as lowercase hex. */
export async function hashSponsorshipToken(raw: string): Promise<string> {
  return await sha256Hex(raw);
}

/** A new raw token (for the link only) and its hash (for the row). */
export async function newSponsorshipToken(): Promise<{
  hash: string;
  token: string;
}> {
  const token = newToken(32);
  return { hash: await hashSponsorshipToken(token), token };
}

/** The gesture a link is about, as its page shows it. */
const linkGestureSchema = z.object({ name: z.string(), slug: z.string() });

export const tokenInputSchema = z.object({ token: sponsorshipTokenSchema });

/** `sponsorships.reedit.get` (S-19). */
export const reeditSchema = z.object({
  displayName: z.string(),
  /** Epoch ms. */
  expiresAt: z.number().int(),
  gesture: linkGestureSchema,
  /** Only then may the logo be replaced. */
  hasLogo: z.boolean(),
});

export const reeditSubmitInputSchema = z.object({
  displayName: displayNameSchema,
  logoKey: logoKeySchema.optional(),
  token: sponsorshipTokenSchema,
});

/** `sponsorships.renewal.get` (S-20). */
export const renewalSchema = z.object({
  /** One more year at the price of `priceSponsorship` (integer cents). */
  amountCents: z.number().int(),
  displayName: z.string(),
  /** The current end, epoch ms. */
  endsAt: z.number().int(),
  gesture: linkGestureSchema,
  hasLogo: z.boolean(),
});

export const renewalCheckoutInputSchema = z.object({
  /** A v4 UUID the page makes once; it becomes `payment.id`. */
  checkoutId: z.uuid(),
  token: sponsorshipTokenSchema,
});
