import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { readBody } from "@/endpoints/auth";
import { guardOrigin } from "@/lib/formPost";
import type { User } from "@/payload-types";

/**
 * `POST /api/consent` — the first production writer `user-consents` has ever
 * had.
 *
 * ## Why there is no unauthenticated path
 *
 * The decision was recorded before this task was written: a guest's choice
 * stays in the browser (`lib/consentStore.ts`), and a row is written only
 * once there is an account to attach it to. `user-consents` denies `create`
 * to everyone — see `collections/UserConsents.ts` — so the only door is the
 * local API with `overrideAccess: true`, and that door is not exposed to a
 * signed-out caller here. A public writer onto an append-only, undeletable
 * table would be a public way to fill a legal-evidence table with rows
 * nobody can ever remove.
 *
 * ## The mechanism, copied rather than reinvented
 *
 * `req.payload.create({ collection, data, overrideAccess: true, req })` is
 * the one pattern this app already uses to write an append-only collection —
 * see `hooks/logSponsorshipTransitions.ts`'s doc comment for why the flag is
 * not a convenience. `req` is threaded through explicitly, and the flag is
 * passed explicitly too even though a `payload.create` with no `req` already
 * defaults `overrideAccess` to `true` (which is why the existing
 * `UserConsents.int.test.ts` fixtures write with neither) — passing both here
 * says, at the call site, exactly what this call is doing.
 */

/** The only collection this endpoint authenticates against. */
const USERS = "users";

/** Every answer here is this caller's own state, and never worth caching. */
const NO_STORE = { "Cache-Control": "no-store" };

function problem(status: number, error: string): Response {
  return Response.json({ error }, { headers: NO_STORE, status });
}

/**
 * Which version of the consent copy a recorded decision was made against.
 *
 * A consent record with no version number is a record of an agreement to
 * nothing in particular — see `collections/UserConsents.ts`'s `required` on
 * `consentVersion`. Bumping this is a separate, later decision (it would also
 * need a way to ask a visitor who already answered under the old text to
 * answer again, which nothing in this app does yet); today it is one literal
 * shared by every row this endpoint writes.
 */
export const CONSENT_VERSION = "2026-09-22";

/**
 * Writes one `user-consents` row: an agreement, or a refusal.
 *
 * ## Why a refusal is written at all
 *
 * The column is `integer DEFAULT false NOT NULL`, so "no row" and "a row
 * saying no" are indistinguishable in SQL, and Stage 9 imports into this
 * table. Writing only on `analyticsConsent === true` would record nothing for
 * everyone who declined, and an import reading this table could never tell
 * them apart from someone who was never asked. This function does not branch
 * on the value at all, on purpose: there is exactly one write path, for
 * exactly two outcomes.
 *
 * ## Why this always adds a row rather than upserting one
 *
 * `user-consents` denies `update` to everyone, including this local-API
 * call — updating is not merely unavailable, it would defeat the point. A
 * changed mind is a new row, and the sequence of rows is the evidence a
 * consent record exists to be.
 */
export async function recordConsent({
  analyticsConsent,
  ipAddress,
  req,
  userAgent,
  userId,
}: {
  analyticsConsent: boolean;
  ipAddress?: string;
  req: PayloadRequest;
  userAgent?: string;
  userId: number | string;
}): Promise<void> {
  await req.payload.create({
    collection: "user-consents",
    data: {
      analyticsConsent,
      consentVersion: CONSENT_VERSION,
      ipAddress,
      /*
       * A number, not whatever `userId` was handed. Same reason
       * `endpoints/favorites.ts` and `lib/mergeGuestState.ts` both convert
       * before a relationship write: `isValidID` requires `typeof value ===
       * 'number'` for this app's numeric id type, so a string id would fail
       * validation with "invalid relationships" rather than write the row —
       * exactly the wrong failure mode for the one write in this app that
       * must never silently not happen.
       */
      user: Number(userId),
      userAgent,
    },
    overrideAccess: true,
    req,
  });
}

/**
 * The address to file alongside the decision, or `undefined`.
 *
 * `cf-connecting-ip` is the header the Cloudflare edge sets and a client
 * cannot override — the same header `endpoints/analytics.ts`'s rate limiter
 * trusts for the same reason. The other, spoofable headers that endpoint
 * reads for geolocation are not appropriate here: a consent record's address
 * is evidence of where the decision was made, not a hint, so it is worth
 * having only when it cannot have been invented by the caller.
 */
function clientIp(headers: Headers): string | undefined {
  return headers.get("cf-connecting-ip") ?? undefined;
}

const postConsent: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  /*
   * **The account comes from the session, never from the body.** Narrowed on
   * the slug rather than on truthiness, for the same reason `lib/session.ts`
   * and `endpoints/favorites.ts` do it: `req.user` is whichever auth
   * collection the token named, and a second one added later must not start
   * writing `user-consents` rows for it. Nothing the body carries — including
   * a `user` or `userId` field — is ever read as the account to write for;
   * see the "records the account from the session" test below for exactly
   * the shape that guards against.
   */
  if (req.user?.collection !== USERS) {
    return problem(401, "signed-out");
  }

  const user = req.user as User;
  const body = await readBody(req);
  const { analyticsConsent } = body as { analyticsConsent?: unknown };

  if (typeof analyticsConsent !== "boolean") {
    return problem(400, "invalid");
  }

  await recordConsent({
    analyticsConsent,
    ipAddress: clientIp(req.headers),
    req,
    userAgent: req.headers.get("user-agent") ?? undefined,
    userId: user.id,
  });

  return Response.json(
    { analyticsConsent },
    { headers: NO_STORE, status: 200 }
  );
};

export const consentEndpoints: Endpoint[] = [
  { handler: postConsent, method: "post", path: "/consent" },
];
