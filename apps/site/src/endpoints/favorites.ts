import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { accountFavoriteIds } from "@/lib/accountFavorites";
import { isTrustedOrigin } from "@/lib/authFlow";
import { isGestureId } from "@/lib/favoritesQuery";
import { mergeGuestFavorites } from "@/lib/mergeGuestState";
import type { User } from "@/payload-types";

/**
 * One favourite, written to the signed-in account.
 *
 * ## Why this is an endpoint and not a route handler
 *
 * Same measurement as `endpoints/auth.ts` and `endpoints/crawler.ts`: an
 * `app/**​/route.ts` that imports Payload becomes its own bundle entry and
 * re-bundles the Payload/D1/drizzle graph into it, measured at **+519 KiB
 * gzipped** when exactly this was tried for the favorites page.
 * `app/(payload)/api/[...slug]/route.ts` already carries that graph, so a
 * handler hung off it costs only the handler. `/account/favorites` is a
 * `next.config.ts` rewrite, which is a routing-manifest entry and bundles
 * nothing.
 *
 * ## Why not just PATCH `/api/users/:id` from the browser
 *
 * That path exists and `isAdminOrSelf` would allow it, and it is the wrong
 * shape twice over.
 *
 * **It cannot be made idempotent from the client.** A `hasMany` relationship
 * is written whole, so the browser would have to read the array, add one id
 * and write it back — and there are no transactions on any write path in
 * this app, so two presses in flight at once lose one of them. Here the
 * read and the write are one server-side step and the client sends the state
 * it wants rather than a delta.
 *
 * **It is a much wider door than it needs to be.** A self-update over REST
 * can send any field the visitor is allowed to write; this accepts exactly
 * one gesture id and one boolean, and touches exactly `favorites`.
 */

/** The only collection this endpoint authenticates against. */
const USERS = "users";

/** Everything here answers with the caller's own state. */
const NO_STORE = { "Cache-Control": "no-store" };

function problem(status: number, error: string): Response {
  return Response.json({ error }, { headers: NO_STORE, status });
}

/**
 * The request body, as `{ favorite, gestureId }`, or `null`.
 *
 * JSON only. This endpoint has exactly one caller — `writeAccountFavorite`
 * in `lib/accountFavorites.ts` — and it is not a form target: a favourite is
 * not something a `<form>` posts, and accepting a form encoding would mean
 * accepting a shape that a cross-site form could produce. `SameSite=Lax`
 * already keeps the session cookie off such a request, and refusing the
 * encoding costs nothing on top.
 */
async function readBody(
  req: PayloadRequest
): Promise<null | { favorite: boolean; gestureId: string }> {
  const [type] = (req.headers.get("content-type") ?? "").split(";", 1);

  if (type !== "application/json" || typeof req.json !== "function") {
    return null;
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch (error) {
    req.payload.logger.warn(
      { err: error },
      "[favorites] Failed to parse the request body"
    );

    return null;
  }

  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { favorite, gestureId } = body as {
    favorite?: unknown;
    gestureId?: unknown;
  };

  if (typeof favorite !== "boolean" || typeof gestureId !== "string") {
    return null;
  }

  /*
   * The id is screened before it reaches a query for the reason
   * `favoritesQuery.ts` spells out: Payload maps an `in`/`equals` on a number
   * column through `parseFloat`, so a non-numeric id is not rejected — it
   * becomes `NaN` and is bound into the statement.
   */
  return isGestureId(gestureId) ? { favorite, gestureId } : null;
}

const setFavorite: PayloadHandler = async (req) => {
  /*
   * `SameSite=Lax` already means a cross-site POST arrives without the
   * session cookie, so the 401 below would catch this anyway. The check is
   * here because that is a property of a setting in `Users.ts` rather than
   * of this file, and the day somebody needs `SameSite=None` for an embedded
   * surface, this endpoint should not silently become writable from any
   * page on the internet.
   */
  if (
    !isTrustedOrigin({
      origin: req.headers.get("origin"),
      requestOrigin: req.origin ?? "",
    })
  ) {
    return new Response("Cross-site request refused.", {
      headers: { ...NO_STORE, "Content-Type": "text/plain" },
      status: 403,
    });
  }

  /*
   * Narrowed on the slug, not on truthiness, for the same reason
   * `lib/session.ts` does it: `req.user` is whichever auth collection the
   * token named, and a second one added later must not start writing
   * `users.favorites`.
   */
  if (req.user?.collection !== USERS) {
    return problem(401, "signed-out");
  }

  const user = req.user as User;
  const body = await readBody(req);

  if (body === null) {
    return problem(400, "invalid");
  }

  /*
   * **The gesture is resolved as this visitor, not as the system.** Without
   * it the endpoint writes whatever id it is handed: Payload's relationship
   * validation only checks that the value is *shaped* like a primary key —
   * `isValidID(value, 'number')` in `payload/dist/utilities/isValidID.js` is
   * a `typeof value === 'number'` test and nothing more — so a dangling row
   * pointing at a gesture that never existed passes validation happily.
   * `overrideAccess: false` also means an inactive gesture cannot be
   * favourited by somebody who is not allowed to see it, which is the same
   * rule the detail page and the favorites list already run under.
   */
  const gesture = await req.payload.findByID({
    collection: "gestures",
    depth: 0,
    disableErrors: true,
    id: body.gestureId,
    overrideAccess: false,
    user,
  });

  if (gesture === null) {
    return problem(404, "unknown-gesture");
  }

  const account = await req.payload.findByID({
    collection: USERS,
    depth: 0,
    disableErrors: true,
    id: user.id,
    overrideAccess: false,
    user,
  });

  if (account === null) {
    // The session resolved but the row is gone — an account deleted in
    // another tab. Same answer as an expired cookie: sign in again.
    return problem(401, "signed-out");
  }

  /*
   * A set, and `Users.ts`'s `beforeChange` hook is a set too. **Neither half
   * is provable alone**, which a mutation sweep confirmed rather than
   * assumed: dropping this `Set` failed nothing, because the hook cleans the
   * array on the way to the database; dropping the hook failed only the
   * hook's own test, because this `Set` never hands it a duplicate. Removing
   * both is caught. Same belt-and-braces shape as the two guards on
   * `/auth/sign-up`, kept for the same reason — each half stops being
   * decorative the day the other is loosened, and a field hook in another
   * file is not something this endpoint should have to depend on for a
   * property it advertises in its own response.
   */
  const current = accountFavoriteIds(account);
  const next = body.favorite
    ? [...new Set([...current, body.gestureId])]
    : current.filter((id) => id !== body.gestureId);

  /*
   * **Numbers, not strings**, and this is not cosmetic. `validations.js`'s
   * relationship check rejects anything `isValidID` refuses, and for the
   * `number` id type that function requires `typeof value === 'number'` — so
   * `favorites: ["7"]` fails validation with "invalid relationships" while
   * `favorites: [7]` succeeds. Verified at the call site and pinned by
   * `favorites.int.test.ts`, because the string form is what every other
   * layer of this feature carries.
   */
  await req.payload.update({
    collection: USERS,
    data: { favorites: next.map(Number) },
    depth: 0,
    id: user.id,
    overrideAccess: false,
    user,
  });

  /*
   * The stored state, echoed back, rather than the state that was asked
   * for. They are the same today — the write above throws rather than
   * partially applying — and saying so from the server is what lets the
   * button refuse to fill itself on anything it did not hear back.
   */
  return Response.json(
    { favorite: body.favorite },
    { headers: NO_STORE, status: 200 }
  );
};

/**
 * The guest ids a merge request carries, or `null`.
 *
 * Deliberately *not* screened for id shape here: `mergeGuestFavorites`
 * filters, deduplicates and caps the list itself, because it is the thing
 * that builds the query and the screen has to sit next to the query it
 * protects. All this asks is that the body is JSON and that `ids` is an
 * array of strings, and it drops the rest of the array rather than the whole
 * request — one corrupt entry in `localStorage` should not cost a reader the
 * other twenty favorites.
 */
async function readMergeBody(req: PayloadRequest): Promise<null | string[]> {
  const [type] = (req.headers.get("content-type") ?? "").split(";", 1);

  if (type !== "application/json" || typeof req.json !== "function") {
    return null;
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch (error) {
    req.payload.logger.warn(
      { err: error },
      "[favorites] Failed to parse the merge request body"
    );

    return null;
  }

  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { ids } = body as { ids?: unknown };

  if (!Array.isArray(ids)) {
    return null;
  }

  return ids.filter((id): id is string => typeof id === "string");
}

/**
 * The guest's list, merged into the signed-in account.
 *
 * Same door discipline as `setFavorite` above — `Origin` first, then the
 * session, then the body — and for the same reasons. The answer carries the
 * account's whole favorites list rather than just what changed, because the
 * caller's job is to repaint a heart that the server rendered before the
 * merge ran and "what you now hold" is the only answer that lets it.
 */
const mergeFavorites: PayloadHandler = async (req) => {
  if (
    !isTrustedOrigin({
      origin: req.headers.get("origin"),
      requestOrigin: req.origin ?? "",
    })
  ) {
    return new Response("Cross-site request refused.", {
      headers: { ...NO_STORE, "Content-Type": "text/plain" },
      status: 403,
    });
  }

  if (req.user?.collection !== USERS) {
    return problem(401, "signed-out");
  }

  const user = req.user as User;
  const ids = await readMergeBody(req);

  if (ids === null) {
    return problem(400, "invalid");
  }

  const result = await mergeGuestFavorites({ ids, payload: req.payload, user });

  if (result === null) {
    // The session resolved but the row is gone — an account deleted in
    // another tab. Same answer as an expired cookie.
    return problem(401, "signed-out");
  }

  return Response.json(
    { added: result.added, favorites: result.favorites },
    { headers: NO_STORE, status: 200 }
  );
};

export const favoritesEndpoints: Endpoint[] = [
  { handler: setFavorite, method: "post", path: "/account/favorites" },
  {
    handler: mergeFavorites,
    method: "post",
    path: "/account/merge-favorites",
  },
];
