import type { Payload } from "payload";

/**
 * The account's own newest recorded analytics decision, read back for
 * display only — never for deciding anything.
 *
 * ## Why this exists, and why it takes `payload` as an argument
 *
 * `user-consents` denies `read` to everyone but an admin
 * (`access/isAdmin` on `collections/UserConsents.ts`), so an account cannot
 * see its own row without `overrideAccess: true` — the same reasoning
 * `endpoints/analytics.ts`'s `withdrewConsent` already established for the
 * same collection, and the same query shape: newest row wins, because
 * `user-consents` is append-only and "what the account last said" is
 * whichever row is newest, not the only one.
 *
 * A `Payload` instance is taken as an argument rather than resolved with
 * `getPayloadClient()` inside this module — the discipline
 * `lib/ownedLists.ts` documents for the same reason: anything reachable from
 * `payload.config.ts` must not re-enter it through the client helper, and
 * while nothing here is registered as an endpoint today, the one caller
 * (`account/page.tsx`) already has an instance from `getPayloadClient()` to
 * hand in, so there is nothing to gain by fetching a second one.
 *
 * ## Why this must never feed the switch
 *
 * Ruling: the server never writes the browser's consent flag, and the
 * corollary is that it must never feed the *switch's* displayed state
 * either. `AccountConsentControl` reads and writes `localStorage` alone for
 * that; this function's answer is wired in beside it as a read-only caption
 * of what the account has on record, never merged into the toggle. See that
 * component's doc comment for the shared-device reasoning the ruling rests
 * on: a "granted" recorded on a phone must not silently turn tracking on for
 * a library computer someone happens to sign into.
 */
export interface ConsentRecord {
  analyticsConsent: boolean;
  recordedAt: string;
}

export async function newestConsentDecision({
  payload,
  userId,
}: {
  payload: Payload;
  userId: number | string;
}): Promise<ConsentRecord | null> {
  const { docs } = await payload.find({
    collection: "user-consents",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    sort: "-createdAt",
    where: { user: { equals: userId } },
  });

  const newest = docs[0];

  if (newest === undefined) {
    /*
     * No row at all — this account has never answered, on any device. This
     * is distinct from a row whose `analyticsConsent` is `false`, which is a
     * decision. The whole reason this stage exists is that the database's
     * own `analytics_consent integer DEFAULT false NOT NULL` cannot tell
     * "never asked" from "said no" — this function's one job, on the read
     * side, is to keep the UI from repeating that confusion by collapsing
     * both into the same falsy value.
     */
    return null;
  }

  return {
    analyticsConsent: newest.analyticsConsent,
    recordedAt: newest.createdAt,
  };
}
