import type { GestureSummary } from "@smog/ui-web";
import type { Category, Gesture } from "@/payload-types";
import type { Locale } from "./locale";

/**
 * Turning a guest's stored ids into cards, without a server route of our own.
 *
 * **Why this is a query builder and not an endpoint.** The first version of
 * this task added `GET /[locale]/favorites/gestures`: a narrow route that ran
 * `payload.find` on the server and answered with exactly `GestureSummary`.
 * It was nicer code. It also cost **519 KiB gzipped**, measured three ways:
 *
 * | build | gzipped |
 * |---|---|
 * | before this task | 7,406.37 KiB |
 * | favorites, with a Payload-free stub route | 7,446.27 KiB |
 * | favorites, with the route calling Payload | 7,964.99 KiB |
 *
 * Every route entry that reaches Payload bundles the Payload/D1/drizzle graph
 * again — the same per-route duplication Stage 3 Task 5 recorded for Mux. The
 * page, the island and the button together are the 40 KiB in the middle row;
 * the other half-megabyte was one `import` in a route handler. Against a
 * budget with 786 KiB of headroom and three tasks still to land, that is not
 * a trade worth making for a projection.
 *
 * So the browser asks Payload's own `/api/gestures`, which is already
 * bundled, already public and already access-filtered. **The properties that
 * mattered are kept, they just moved:**
 *
 * - `publicReadActive` still governs the read, because the request is
 *   anonymous. Nothing here can surface a gesture the list page hides, and a
 *   favourite that an editor has since deactivated simply stops resolving.
 *   That guarantee never depended on our code; it is Payload's access layer.
 * - `select` keeps the answer to the three fields a card draws, so whole
 *   documents do not cross the network. Verified against
 *   `node_modules/payload/dist/collections/endpoints/find.js` (3.89.0), whose
 *   `parseParams(req.query)` reads `select` — rather than assumed.
 * - the ids are still filtered, deduplicated and capped before they reach a
 *   query, and the result is still re-sorted into the guest's own order.
 *
 * What is genuinely lost: the rules below run in the browser, so they bind
 * this caller rather than the endpoint. `/api/gestures` was already public,
 * so this widens nothing — but a future caller gets no help from them.
 */

/**
 * How many favorites one request resolves.
 *
 * Both a URL-length bound and a bound on the `IN (...)` list. The second is
 * the real one: D1 caps how many parameters a statement may bind, and
 * `apps/site/README.md` records what it looks like when something crosses it
 * (`D1_ERROR: too many SQL variables`, from an unbounded read elsewhere in
 * this file's neighbour). Past the cap the oldest favorites go unresolved
 * rather than the whole page failing.
 */
export const MAX_FAVORITE_IDS = 200;

/**
 * Ids that can safely reach a `where` clause.
 *
 * Gesture ids are D1 integers, and Payload maps an `in` list onto
 * `parseFloat` for a number column — verified in
 * `node_modules/@payloadcms/drizzle/dist/queries/sanitizeQueryValue.js`
 * (3.89.0): `createArrayFromCommaDelineated` then `.map(parseFloat)`. So a
 * non-numeric entry is not rejected, it becomes `NaN` and is bound into the
 * statement. These ids come out of `localStorage`, which is user-writable and
 * may hold anything at all.
 *
 * A leading zero is rejected rather than normalized: `007` and `7` would
 * otherwise both resolve to row 7, and the result could not be matched back
 * to the id that was asked for.
 */
const ID_PATTERN = /^[1-9][0-9]{0,15}$/;

/**
 * The ids worth asking about: real-looking, each once, at most `MAX`.
 */
export function usableFavoriteIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => ID_PATTERN.test(id)))].slice(
    0,
    MAX_FAVORITE_IDS
  );
}

/**
 * The request that resolves them.
 *
 * `isActive` is sent explicitly even though `publicReadActive` already
 * enforces it, for the same reason `buildGestureWhere` does: the page stays
 * correct the day someone loosens access for an unrelated reason, and it
 * costs one term in a query that was being built anyway.
 *
 * `limit` is the number of ids rather than Payload's default of ten, or a
 * guest with eleven favorites would silently see ten.
 */
export function favoriteGesturesUrl(
  ids: readonly string[],
  locale: Locale
): string {
  const query = new URLSearchParams({
    depth: "1",
    limit: String(ids.length),
    locale,
    "select[categories]": "true",
    "select[name]": "true",
    "select[playbackId]": "true",
    "where[id][in]": ids.join(","),
    "where[isActive][equals]": "true",
  });

  return `/api/gestures?${query}`;
}

/**
 * One document from the answer, as a card wants it.
 *
 * Deliberately a copy of `toGestureSummary`'s three conversions rather than
 * an import of it: that function lives in `gestureQuery.ts`, which imports
 * `payloadClient`, which imports the Payload config. Pulling that into a
 * client component is precisely the half-megabyte this module exists to
 * avoid. The duplication is ten lines and the comment above it; the
 * alternative is a build-graph edge nobody can see.
 */
function toSummary(gesture: Gesture): GestureSummary {
  return {
    categories: (gesture.categories ?? [])
      .filter((category): category is Category => typeof category === "object")
      .map((category) => ({
        id: String(category.id),
        name: category.name ?? "",
      })),
    id: String(gesture.id),
    name: gesture.name ?? "",
    playbackId: gesture.playbackId,
  };
}

/**
 * Narrows the answer, and puts it back in the guest's order.
 *
 * `null` means "this is not an answer" — the caller shows an error rather
 * than an empty list, because "we could not ask" and "you have none" are
 * different things and only one of them is the reader's fault.
 *
 * A row that is present but not card-shaped is dropped rather than rendered,
 * and an id that resolved to nothing is simply absent: the list is a set of
 * bookmarks, and a deleted or deactivated gesture should leave a shorter list
 * rather than an error.
 */
export function readFavoriteGestures(
  body: unknown,
  ids: readonly string[]
): GestureSummary[] | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { docs } = body as { docs?: unknown };

  if (!Array.isArray(docs)) {
    return null;
  }

  const byId = new Map(
    docs
      .filter(
        (doc): doc is Gesture =>
          typeof doc === "object" &&
          doc !== null &&
          (typeof (doc as Gesture).id === "number" ||
            typeof (doc as Gesture).id === "string")
      )
      .map((doc) => [String(doc.id), toSummary(doc)])
  );

  return ids
    .map((id) => byId.get(id))
    .filter((summary): summary is GestureSummary => summary !== undefined);
}
