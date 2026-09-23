import type { Payload, Where } from "payload";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { getPayloadClient } from "./payloadClient";

/**
 * The `where` clause one locale's pass over the search index turns into.
 *
 * `title` and `concepts` are both localized columns on the `search`
 * collection, and both are searched: `concepts` is the synonym list an editor
 * fills in precisely so a gesture is findable by a word that is not its name.
 *
 * `contains` and not `equals` — Payload's `contains` wraps the value in `%`
 * and the D1 adapter maps it to SQLite's `LIKE`, which is case-insensitive
 * for ASCII (`@payloadcms/db-d1-sqlite/dist/index.js` replaces the Drizzle
 * default `ilike` for exactly that reason; `ILIKE` is Postgres syntax and
 * SQLite would reject it). So "hal" finds "Hallo" without a second index.
 *
 * `isActive` is belt to `overrideAccess: false`'s braces. The access rule
 * (`publicReadActive`, mirrored onto the index by `beforeSyncGesture`) is
 * what enforces this today; the clause keeps the query honest the day someone
 * loosens `search.read` so the admin panel's Reindex button gets easier, and
 * search must never become a way to enumerate gestures the list page refuses
 * to serve.
 */
export function buildSearchWhere(query: string): Where {
  return {
    and: [
      { isActive: { equals: true } },
      {
        or: [{ title: { contains: query } }, { concepts: { contains: query } }],
      },
    ],
  };
}

/** One locale's pass: the gesture ids whose index entry matches in `locale`. */
async function findIdsInLocale(
  payload: Payload,
  query: string,
  locale: Locale
): Promise<(number | string)[]> {
  const results = await payload.find({
    collection: "search",
    /*
     * `depth: 0` leaves `doc.value` as the bare gesture id, which is all this
     * function returns. Populating the gesture would be a second query per
     * row to build a list `fetchGestures` is about to fetch properly anyway.
     */
    depth: 0,
    /*
     * Every match, not a page of them. The caller turns this into one
     * `id: { in: [...] }` clause and paginates *that*, so a page-sized slice
     * here would cap the whole result set at twelve rather than the first
     * page at twelve. `pagination: false` drops the count query that would
     * otherwise be issued alongside it and never read.
     */
    limit: 0,
    locale,
    overrideAccess: false,
    pagination: false,
    /*
     * `priority` is the plugin's relevance knob (`defaultPriorities` in
     * `payload.config.ts`), `id` the tie-breaker that keeps the order stable
     * between the two passes. The list page re-sorts by name, so this only
     * decides which locale's match is named first in the union below.
     */
    sort: ["-priority", "id"],
    where: buildSearchWhere(query),
  });

  return results.docs.map((entry) =>
    typeof entry.doc.value === "object" ? entry.doc.value.id : entry.doc.value
  );
}

/**
 * The gestures matching a free-text query, as ids, with a cross-locale
 * fallback.
 *
 * **Why two queries.** Payload's `localization.fallback: true` applies when a
 * document is *read* — `fields/hooks/afterRead/promise.js` (3.89.0) swaps in
 * `fallbackLocale`'s value after the rows come back — and nowhere in the
 * query builder: `queries/getTableColumnFromPath.js` joins the `_locales`
 * table on `eq(_locale, locale)` and never mentions `fallbackLocale` at all.
 * So a French query against a Dutch-only entry reads the `fr` column, finds
 * NULL, and matches nothing, while *reading* that same entry in French
 * happily returns its Dutch title. Both halves are pinned by
 * `src/search/search.int.test.ts`.
 *
 * Since `en` and `fr` start empty, a single French query would return zero
 * rows for every gesture on the site: a French visitor would see an empty
 * search and no error. Hence the second pass over the default locale.
 *
 * **Why not one clause.** Payload's locale handling is per-query, not
 * per-clause: `locale` is an argument to `find`, and the join condition above
 * is built once from it. `{ or: [...] }` cannot ask for two locales, and
 * `locale: "all"` — which the query builder does accept, skipping the
 * `_locale` condition entirely — changes every localized field in the
 * returned documents into a per-locale object and drops the fallback. Two
 * ordinary queries are the honest way to express two locales.
 *
 * The union preserves the requested locale's order and drops repeats, so a
 * gesture whose French *and* Dutch entries match is named once, first.
 */
export async function searchGestureIds(
  query: string,
  locale: Locale
): Promise<(number | string)[]> {
  const trimmed = query.trim();

  /*
   * Before the client is booted, deliberately. `?q=` is what a cleared search
   * box leaves in the URL and it means "everything", which the caller
   * expresses by constraining nothing at all — see `searchIds` in
   * `gestureQuery.ts`, where a blank `q` suppresses the clause outright.
   */
  if (trimmed === "") {
    return [];
  }

  const payload = await getPayloadClient();
  const ids = await findIdsInLocale(payload, trimmed, locale);

  if (locale === DEFAULT_LOCALE) {
    return ids;
  }

  const seen = new Set(ids);

  for (const id of await findIdsInLocale(payload, trimmed, DEFAULT_LOCALE)) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}
