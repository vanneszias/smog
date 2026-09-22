import type { Endpoint, PayloadHandler } from "payload";
import { parseGestureListParams } from "@/lib/gestureListParams";
import { fetchGestures, toGestureSummary } from "@/lib/gestureQuery";
import { resolveLocale } from "@/lib/locale";
import { searchGestureIds } from "@/lib/search";

/**
 * `GET /api/mobile/gestures` — the native app's one non-trivial read.
 *
 * ## Why this exists and the rest of the app's reads do not
 *
 * A gesture by id and the category list are ordinary `GET /api/<collection>`
 * reads: `publicReadActive` already filters an anonymous request to active
 * rows, and a category list with no pagination has nothing for an unstable
 * sort to break. This one is different for two reasons that are both rules
 * the web already owns and a client has no way to re-derive from a query
 * string:
 *
 * - **The sort.** `gestureQuery.ts`'s `fetchGestures` sorts `["name", "id"]`
 *   and clamps an overshot page by re-querying — see that module's own
 *   comment for what an unstable sort or an unclamped page does to a
 *   paginated list. Neither is expressible as `?sort=` and `?page=`.
 * - **The fallback.** `search.ts`'s `searchGestureIds` runs two passes
 *   because Payload's `localization.fallback` applies to a *read*, never to
 *   a `where` clause — a single `?where[title][contains]=` would silently
 *   return nothing for `en` and `fr`, the two locales with no content of
 *   their own yet.
 *
 * The handler below calls both shipped helpers and holds no rule of its
 * own: no `where` clause is built here, and none should be added. A filter
 * this endpoint needed that `gestureQuery.ts` did not already express would
 * belong there, not here, for the same reason the sort and the fallback do.
 */
const listGestures: PayloadHandler = async (req) => {
  const locale = resolveLocale(req.searchParams.get("locale") ?? undefined);
  const { categories, page, q } = parseGestureListParams(req.searchParams);

  /*
   * `undefined` — not `[]` — when nothing was searched, so `buildGestureWhere`
   * (called inside `fetchGestures`) knows to leave the search clause out
   * altogether rather than constraining to an empty set. See that function's
   * own comment on the three states `searchIds` can be in.
   */
  const searchIds =
    q.trim() === "" ? undefined : await searchGestureIds(q, locale);

  const result = await fetchGestures({
    categories,
    locale,
    page,
    q,
    searchIds,
  });

  return Response.json(
    {
      docs: result.gestures.map(toGestureSummary),
      page: result.page,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    },
    {
      headers: { "Cache-Control": "no-store" },
      status: 200,
    }
  );
};

export const mobileEndpoints: Endpoint[] = [
  { handler: listGestures, method: "get", path: "/mobile/gestures" },
];
