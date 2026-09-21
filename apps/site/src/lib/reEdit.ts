import type { Payload } from "payload";
import type { Sponsorship } from "@/payload-types";

/**
 * One sponsorship, resolved from a re-edit token.
 *
 * Shared by the page and by `POST /api/sponsor/re-edit` so that "which row
 * does this token name, and is it still a live link" has exactly one answer.
 * Four things here are decisions rather than defaults, and they are the same
 * four `lib/sharedList.ts` documents for the share-link surface:
 *
 * **`req.searchParams` is the only way the token reaches the access filter.**
 * `sponsorshipReEditAccess` reads `req.searchParams.get("reEditToken")`,
 * which Payload fills in from the URL on a REST request. A Local API call has
 * no URL: `payload/dist/utilities/createLocalReq.js` (3.89.0) synthesises a
 * fake one and assigns `req.searchParams` from it *only when the caller has
 * not supplied one* (`if (!req.searchParams)`). So passing a `URLSearchParams`
 * in survives, and omitting it hands the access function an empty one — which
 * is exactly the tokenless case it denies. This matters more here than it
 * does for `lists`, because this is also the endpoint's path: an endpoint's
 * `req` carries the *form post's* search parameters, which do not contain the
 * token, so the read has to be told rather than left to inherit.
 *
 * **`overrideAccess: false` is the authorisation, not a formality.** It is
 * what runs the access filter above, which is what enforces the expiry. The
 * endpoint that writes afterwards runs with `overrideAccess: true` and a
 * closed set of fields; this read is the only thing standing between a
 * stranger and that write, so it is deliberately the access-checked one.
 *
 * **There is no `where` at all, and `lib/sharedList.ts`'s belt-and-braces
 * pairing is deliberately not copied.** It cannot be: `reEditToken` is
 * `hidden: true`, and Payload 3.89.0 refuses a caller-supplied `where` on a
 * path the requester has no *read permission* for whenever
 * `overrideAccess` is false — `database/queryValidation/validateSearchParams.js`
 * looks the path up in the entity's field permissions and a hidden field is
 * not in them. Adding `where: { reEditToken: { equals: token } }` here does
 * not narrow the query; it makes every request a 400 `QueryError`, which is
 * how this was found. The access filter's own `Where` is merged *after* that
 * validation runs and is not subject to it, so the token clause still reaches
 * the database — from one place, which is the place that also applies the
 * expiry.
 *
 * **`disableErrors: true`** so a denied read is `docs: []` rather than a
 * thrown `Forbidden`: the page's job is to say "this link is no longer
 * valid", and a dead link must not answer 500.
 *
 * `depth: 1` populates `gesture`, which is where the page's heading and the
 * video it plays come from. A gesture an editor deactivated since comes back
 * as a bare id, because `gestures.read` is `publicReadActive` and this read
 * is access-checked; the page handles that rather than assuming a document.
 */
export async function findSponsorshipByReEditToken(
  payload: Payload,
  token: string
): Promise<Sponsorship | null> {
  const trimmed = token.trim();

  /*
   * Not merely an optimisation, though it is one — a page hit with no token
   * asks the database nothing. `sponsorshipReEditAccess` refuses a blank
   * token as well, so this is the second of two closed doors rather than the
   * only one; it is here because a function that will happily ask the
   * database about the empty string is one line away from being called by
   * something that does not check either.
   */
  if (trimmed === "") {
    return null;
  }

  const { docs } = await payload.find({
    collection: "sponsorships",
    depth: 1,
    disableErrors: true,
    limit: 1,
    overrideAccess: false,
    req: { searchParams: new URLSearchParams({ reEditToken: trimmed }) },
  });

  return docs[0] ?? null;
}
