import type { Access, AccessResult, Where } from "payload";

/**
 * Extracts the `reEditToken` query parameter, treating an absent or
 * empty/whitespace-only value as "no token".
 *
 * This is the same normalisation `access/lists.ts` performs on
 * `shareToken`, and it exists for the same reason, which is worth restating
 * because the collection it guards is worse to get wrong: a naive
 * `req.searchParams?.get("reEditToken")` compared with `{ equals: token }`
 * when `token` is `undefined` builds
 * `{ reEditToken: { equals: undefined } }`, and the query layer matches that
 * against **every row whose `reEditToken` column is NULL**. On `lists` that
 * was every private list. Here it is worse: a re-edit token is minted only
 * while a sponsorship is waiting to be re-edited and is cleared the moment it
 * is used, so the overwhelming majority of sponsorships have no token at all
 * — and each one carries a sponsor's email, contact name, invoice name and
 * VAT number. `{ equals: "" }` is the same trap with a smaller blast radius:
 * it matches only if some row's token genuinely is the empty string, which is
 * not "deny everything" either. Both normalise to `null` here, and the caller
 * returns `false` for `null`.
 */
function reEditToken(req: { searchParams?: URLSearchParams }): string | null {
  const token = req.searchParams?.get("reEditToken");

  return token && token.trim() !== "" ? token.trim() : null;
}

/**
 * The two conditions a live re-edit link satisfies.
 *
 * **The expiry is enforced here and nowhere else.** `reEditTokenExpiresAt`
 * has existed since Stage 1 with nothing reading it — the spec's Review Focus
 * 5 is exactly that — and this conjunct is what makes the column mean
 * something. Putting it in the access filter rather than in each caller's
 * `where` means every door honours it at once: the page, the re-edit
 * endpoint's own lookup, and Payload's REST API, which is mounted and will
 * answer `GET /api/sponsorships?reEditToken=…` for anybody who asks.
 *
 * A NULL expiry is refused, not accepted: SQL's `>` is false against NULL, so
 * a row carrying a token and no expiry is unreachable. That is the safe
 * direction — a capability with no end is the thing this conjunct exists to
 * prevent — and `access/sponsorships.int.test.ts` pins it, because nothing
 * about `required: false` on that column says which way it should fall.
 *
 * ISO-8601 strings, which is what the D1 adapter stores and what sorts
 * identically lexically and chronologically; `lib/sponsorOverlay.ts` compares
 * the term's two bounds the same way.
 */
function liveToken(token: string, now: string): Where {
  return {
    and: [
      { reEditToken: { equals: token } },
      { reEditTokenExpiresAt: { greater_than: now } },
    ],
  };
}

/**
 * Admins read every sponsorship. Everyone else reads exactly the one row an
 * unexpired `reEditToken` query parameter names, and nothing at all without
 * one.
 *
 * The spec's rule is "sponsor reads own by token; admin has full access", and
 * **read** is the whole of it. `create`, `update` and `delete` stay `isAdmin`
 * in `collections/Sponsorships.ts`, which is a decision rather than an
 * omission:
 *
 * - The sponsor's own write — resubmitting after a re-edit — goes through
 *   `POST /api/sponsor/re-edit`, which proves the token with a read through
 *   this function and then writes a closed set of four fields. One writer
 *   that names what it changes is a smaller surface than an open REST `PATCH`
 *   fenced in by a field guard on each of the twenty-odd columns it must not
 *   touch, where one missing guard is a sponsor editing their own price.
 * - It also means the token cannot approve the sponsorship it belongs to,
 *   cannot move money, and cannot cancel a paid row, without any of those
 *   being a separate rule that could be loosened by accident.
 *
 * There is no signed-in branch. `lists` has one because a share link's
 * recipient may also own lists of their own; a sponsor is a company buying
 * one thing once and has no account in this product at all (see
 * `endpoints/sponsorships.ts`), so "signed in" is not a property anybody
 * granted anything to here. An admin is handled by the first line; a
 * signed-in ordinary user is in exactly the position of an anonymous one.
 */
export const sponsorshipReEditAccess: Access = ({ req }): AccessResult => {
  if (req.user?.role === "admin") {
    return true;
  }

  const token = reEditToken(req);

  if (!token) {
    return false;
  }

  return liveToken(token, new Date().toISOString());
};
