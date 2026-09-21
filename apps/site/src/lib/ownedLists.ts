import type { Payload } from "payload";
import type { List, User } from "@/payload-types";
import type { Locale } from "./locale";

/**
 * The owner's own lists: the one read behind every page and endpoint under
 * `/account/lists`.
 *
 * **Nothing here imports Payload at runtime.** `Payload` is a type-only
 * import and erases, for the reason `apps/site/README.md` gives under
 * "robots.txt and sitemap.xml are not in `app/`": anything reachable from
 * `payload.config.ts` — which `endpoints/lists.ts` is — must take its
 * instance as an argument rather than call `getPayloadClient()`, because the
 * config dynamically imports itself through that helper and the cycle cost
 * 22.86 KiB of duplicated graph the last time it existed. The pages pass the
 * client they already have; the endpoints pass `req.payload`.
 *
 * That constraint bought something worth having: the pages and the endpoints
 * resolve a list through *one* function, so the owner filter below is written
 * once and cannot be right on the read and missing on the write.
 *
 * **The owner filter is in the query and is not left to the access rule.**
 * `listReadAccess` already narrows a signed-in non-admin to
 * `{ owner: { equals: req.user.id } }`, so for an ordinary member the clause
 * changes no answer at all. It changes two others:
 *
 * - **An administrator.** `listReadAccess` returns `true` for `role:
 *   "admin"`, so without the clause an admin opening `/nl/account/lists`
 *   would be shown every list in the database under the heading "your
 *   lists", and could rename or delete a member's list from a page that says
 *   it is theirs. This surface is the owner's; the admin panel is where a
 *   list that is not yours is edited. `ownedLists.int.test.ts` fails by name
 *   if that stops being true.
 * - **A share token.** `listReadAccess` and `listUpdateAccess` both widen a
 *   signed-in reader's filter with the token the request carries —
 *   deliberately, so a signed-in recipient can follow a share link. A Local
 *   API call has no URL, so no token reaches these reads today
 *   (`payload/dist/utilities/createLocalReq.js` synthesises an empty
 *   `searchParams` when the caller supplies none), but an endpoint is one
 *   `req` argument away from having one, and a view link to somebody else's
 *   list must never become a rename box for it.
 *
 * `overrideAccess: false` stays beside it as the brace to that belt — the
 * same pairing `lib/sharedList.ts` and `buildGestureWhere` keep, for the same
 * reason: each alone answers correctly for an ordinary member, and the query
 * stays right the day somebody loosens the other for an unrelated reason.
 * `ownedLists.test.ts` pins each half by name so neither is dropped as
 * redundant.
 */

/**
 * How many lists the index shows.
 *
 * A bound rather than a page size, because a reader with more than a hundred
 * lists is not the reader this page is for, and an unbounded read is how D1's
 * per-statement parameter cap is met — `apps/site/README.md` records what
 * that looks like, and it is drizzle's `Failed query:` with every id in the
 * statement rather than anything mentioning SQL variables. Payload's own
 * default is ten, which would silently hide the eleventh list somebody made.
 */
const MAX_OWNED_LISTS = 100;

/**
 * How many gestures one list may hold.
 *
 * **Not D1's parameter cap**, which is what the first draft of this bound
 * claimed and what `MAX_FAVORITE_IDS` is genuinely about. Measured against
 * this project's own database rather than reasoned about: a list of 120 items
 * writes fine — `@payloadcms/drizzle`'s `insertArrays` chunks the insert at 25
 * rows per statement — and reads fine at `depth: 1`, in 32 ms, because the
 * populate is a join and not an `IN (...)` of one parameter per row. The cap
 * is real (it bit at 120 parameters in an unrelated `payload_preferences`
 * delete during the same probe), but nothing this feature does approaches it.
 *
 * The bound that is real here is **quadratic**: an array field is written
 * whole, so `endpoints/lists.ts` re-sends every existing row on every add and
 * Payload deletes and re-inserts the lot. Adding the nth gesture rewrites n
 * rows, and the page renders all of them. Fifty is a generous ceiling for a
 * curated list and keeps that rewrite cheap.
 *
 * It lives here rather than in `endpoints/lists.ts` because the page states
 * it to the reader and the endpoint enforces it, and a bound worded in one
 * place and enforced in another drifts.
 */
export const MAX_LIST_ITEMS = 50;

/**
 * Whether a string looks like a list's primary key.
 *
 * Deliberately the same rule as `isGestureId` in `lib/favoritesQuery.ts`, and
 * deliberately not the same function: both describe a D1 integer primary key
 * today, and the day one collection moves to UUIDs only one of them changes.
 * The reasoning is that file's and applies unchanged — Payload maps an
 * `equals` on a number column through `parseFloat`
 * (`@payloadcms/drizzle/dist/queries/sanitizeQueryValue.js`), so a
 * non-numeric id is not rejected: it becomes `NaN` and is bound into the
 * statement. These ids arrive from a URL segment and from a form field, both
 * of which anybody can write.
 *
 * Module-private: `fetchOwnedList` is the only door to a list and applies it
 * itself, so no caller has to remember to. `ownedLists.test.ts` proves that
 * by asserting a non-numeric id opens no database connection at all.
 */
function isListId(value: string): boolean {
  return /^[1-9][0-9]{0,15}$/.test(value);
}

/** The lists this account owns, most recently changed first. */
export async function fetchOwnedLists({
  locale,
  payload,
  user,
}: {
  locale: Locale;
  payload: Payload;
  user: User;
}): Promise<List[]> {
  const { docs } = await payload.find({
    collection: "lists",
    /*
     * `depth: 0` leaves every `items[].gesture` a bare id, which is all the
     * index draws: it counts them. Populating them would be a query per list
     * to arrive at a number.
     */
    depth: 0,
    limit: MAX_OWNED_LISTS,
    locale,
    overrideAccess: false,
    /*
     * `id` is the tie-breaker for the same reason `fetchGestures` has one:
     * two lists saved in the same second sort equal on `updatedAt`, and an
     * unstable order is a list that shuffles under the reader between one
     * page load and the next.
     */
    sort: ["-updatedAt", "id"],
    user,
    where: { owner: { equals: user.id } },
  });

  return docs;
}

/**
 * One list this account owns, or `null`.
 *
 * `null` covers both "no such list" and "not yours", and every caller keeps
 * them indistinguishable — see `AccountListsError`'s `unknown` in
 * `lib/authFlow.ts`. They are *produced* by one query rather than reported by
 * one message, which is what makes that promise cheap to keep: there is no
 * branch between the two for a message, a status or a timing difference to
 * leak out of.
 *
 * **`depth` is the caller's, because the two callers want different
 * documents.** A page draws each item's gesture and needs it populated
 * (`depth: 1`); an endpoint rewrites `items` and wants the bare ids it is
 * about to write back (`depth: 0`), because a populated gesture would have to
 * be reduced to its id again before it could be sent. `depth: 2` is nobody's:
 * it would additionally populate each gesture's categories, which no owner
 * page draws.
 *
 * An item whose gesture stays a bare number at `depth: 1` is not an error.
 * `publicReadActive` leaves a deactivated gesture unpopulated, and the owner
 * still has to see that the row is there and be able to take it off.
 */
export async function fetchOwnedList({
  depth,
  id,
  locale,
  payload,
  user,
}: {
  depth: 0 | 1;
  id: string;
  locale: Locale;
  payload: Payload;
  user: User;
}): Promise<List | null> {
  /*
   * Before the database is asked anything, deliberately — the same shape as
   * `fetchSharedList`'s blank-token guard. `/nl/account/lists/abc` routes,
   * and `{ id: { equals: "abc" } }` reaches the adapter as `NaN` rather than
   * being refused.
   */
  if (!isListId(id)) {
    return null;
  }

  const { docs } = await payload.find({
    collection: "lists",
    depth,
    /*
     * A denied read is `docs: []` rather than a thrown `Forbidden`
     * (`payload/dist/collections/operations/find.js` throws from
     * `executeAccess` when errors are enabled). Nothing here should answer a
     * 500 to a request for a list that is not yours.
     */
    disableErrors: true,
    limit: 1,
    locale,
    overrideAccess: false,
    pagination: false,
    user,
    where: { and: [{ id: { equals: id } }, { owner: { equals: user.id } }] },
  });

  return docs[0] ?? null;
}
