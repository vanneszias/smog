import type { GestureSummary } from "@smog/ui-web";
import type { Payload, Where } from "payload";
import type { Category, Gesture } from "@/payload-types";
import type { Locale } from "./locale";

/**
 * Rows per page.
 *
 * Twelve divides evenly by the grid's 1, 2 and 3 column breakpoints, so the
 * last row is never a ragged one or two cards wide on any viewport.
 */
export const GESTURES_PER_PAGE = 12;

/*
 * Neither of the two interfaces below is exported, and that is knip's doing
 * rather than a design choice: `bun release:check` fails on an exported
 * symbol nothing imports, and nothing outside this module names either type
 * today — callers pass object literals and read the result's fields. They
 * are still the module's contract; they are just spelled out in the function
 * signatures instead of re-exported. Task 4 exports `GestureListParams` at
 * the moment `search.ts` first imports it.
 */
interface GestureListParams {
  q?: string;
  categories?: string[];
  page?: number;
  /**
   * **Task 4's seam, and deliberately not search itself.**
   *
   * Search needs an explicit cross-locale fallback — Payload's `fallback: true`
   * applies to reads and not to `where` clauses, so a French visitor querying
   * Dutch-only content matches nothing — and that belongs in `search.ts`, next
   * task. What this task owns is *where the result plugs in*: a resolved id
   * list becomes an `id: { in: [...] }` clause alongside the category filter.
   *
   * The three states are distinct and each means something different:
   *
   * - `undefined` — nobody resolved a search, so nothing is constrained. This
   *   is what Task 3 passes, which is why typing in the box currently filters
   *   nothing. It is a seam, not a half-built search.
   * - `[]` — a search ran and matched nothing, which must show an empty page.
   *   This is the one case where an empty `in` is correct, and it is why this
   *   is a separate field from `categories` rather than more of the same.
   * - a non-empty list — the matches.
   *
   * A blank `q` suppresses all three: see `buildGestureWhere`.
   */
  searchIds?: readonly (number | string)[];
}

interface GestureListResult {
  gestures: Gesture[];
  totalPages: number;
  totalDocs: number;
  page: number;
}

/**
 * The `where` clause a list request turns into.
 *
 * `isActive` is unconditional and non-negotiable. `publicReadActive` already
 * filters at the access layer and `fetchGestures` passes `overrideAccess:
 * false` so that it runs — but a page that also asks for active rows stays
 * correct the day someone loosens access for an unrelated reason, and it
 * costs one term in a query that was already being built.
 *
 * Two omissions are load-bearing, and both empty the page when they go wrong:
 *
 * - an empty `categories` array emits **no** clause. `{ in: [] }` matches
 *   nothing, so passing it through would turn "no filter selected" into "no
 *   results", which reads as a broken page rather than a full one.
 * - a blank or whitespace-only `q` emits no clause either, and suppresses
 *   `searchIds` with it. `?q=` is what a cleared search box leaves in the
 *   URL, and it must mean "everything", not "nothing".
 */
export function buildGestureWhere(params: GestureListParams): Where {
  const clauses: Where[] = [{ isActive: { equals: true } }];

  const categories = params.categories ?? [];
  if (categories.length > 0) {
    clauses.push({ categories: { in: [...categories] } });
  }

  if (
    params.q !== undefined &&
    params.q.trim() !== "" &&
    params.searchIds !== undefined
  ) {
    clauses.push({ id: { in: [...params.searchIds] } });
  }

  return clauses.length === 1 ? (clauses[0] as Where) : { and: clauses };
}

/**
 * A Payload gesture as `GestureCard` wants it.
 *
 * Three conversions, each of which is a rendering bug when skipped: ids are
 * integers in D1 and `GestureSummary` keys React lists on strings; a
 * `depth: 0` read leaves `categories` as bare ids, which have no `name` to
 * show and must be dropped rather than rendered as `[object Object]`; and
 * `name` is localized and therefore nullable, so an untranslated gesture
 * needs *something* to label the card with.
 */
export function toGestureSummary(gesture: Gesture): GestureSummary {
  const categories = (gesture.categories ?? [])
    .filter((category): category is Category => typeof category === "object")
    .map((category) => ({
      id: String(category.id),
      name: category.name ?? "",
    }));

  return {
    id: String(gesture.id),
    name: gesture.name ?? "",
    categories,
    playbackId: gesture.playbackId,
  };
}

/**
 * A page number that can be handed to Payload.
 *
 * `page` arrives from a query string, so it can be `NaN`, `0`, `-3` or
 * `2.5`. Every one of those produces a nonsense `offset` in the adapter
 * rather than an error, so they are normalized to the first page here. The
 * upper bound cannot be applied yet — it needs the total.
 */
function normalizePage(page: number | undefined): number {
  if (page === undefined || !Number.isFinite(page)) {
    return 1;
  }

  return Math.max(1, Math.floor(page));
}

async function getPayloadClient(): Promise<Payload> {
  /*
   * Both imports are dynamic so this module can be imported by a jsdom unit
   * test without booting Payload: `payload.config.ts` resolves Cloudflare
   * bindings at module scope, and a static import is hoisted above
   * everything that might have avoided it.
   */
  const [{ getPayload }, { default: config }] = await Promise.all([
    import("payload"),
    import("@/payload.config"),
  ]);

  return await getPayload({ config });
}

/**
 * One page of gestures, filtered in the database.
 *
 * The count comes back from the same `where` the rows do, so the page numbers
 * describe the filtered set and not the table. That is the whole point of the
 * task: `apps/web` loads every gesture and filters the array in the browser,
 * which cannot be paginated honestly.
 *
 * **Payload does not clamp `page`, and reports a misleading total when it
 * overshoots.** Verified in
 * `node_modules/@payloadcms/drizzle/dist/find/findMany.js` (3.89.0) rather
 * than assumed: `offset` is `(page - 1) * limit` with no upper bound, and
 * when the query needs a join — which this one always does, because the sort
 * is on the localized `name` — an empty slice short-circuits to
 * `{ docs: [], totalDocs: 0, totalPages: 0, page: 1 }`. So `?page=99` would
 * otherwise render "Pagina 1 van 0" over an empty grid and strand every row.
 *
 * Hence: count separately when the slice comes back empty past page one,
 * clamp, and re-query. The extra count is paid only on the clamping path.
 */
export async function fetchGestures(
  params: GestureListParams & { locale: Locale }
): Promise<GestureListResult> {
  const payload = await getPayloadClient();
  const where = buildGestureWhere(params);
  const requestedPage = normalizePage(params.page);

  const query = {
    collection: "gestures" as const,
    depth: 1,
    limit: GESTURES_PER_PAGE,
    locale: params.locale,
    overrideAccess: false,
    /*
     * `id` is the tie-breaker, not decoration. `name` is localized and
     * optional, so in a locale nothing is translated into, every row sorts
     * equal — and an unstable order across two requests is how a paginated
     * list shows the same gesture twice and never shows another one at all.
     */
    sort: ["name", "id"],
    where,
  };

  const first = await payload.find({ ...query, page: requestedPage });

  const totalDocs =
    first.docs.length === 0 && requestedPage > 1
      ? (
          await payload.count({
            collection: "gestures",
            locale: params.locale,
            overrideAccess: false,
            where,
          })
        ).totalDocs
      : first.totalDocs;

  const totalPages = Math.max(1, Math.ceil(totalDocs / GESTURES_PER_PAGE));
  const page = Math.min(requestedPage, totalPages);

  if (page === requestedPage) {
    return { gestures: first.docs, page, totalDocs, totalPages };
  }

  const clamped = await payload.find({ ...query, page });

  return { gestures: clamped.docs, page, totalDocs, totalPages };
}

/**
 * The active categories, for the filter control.
 *
 * Sorted the same way the gestures are and read as an anonymous visitor, so a
 * category an editor deactivated cannot be offered as a filter that returns
 * nothing.
 */
export async function fetchCategoryOptions(
  locale: Locale
): Promise<{ id: string; name: string }[]> {
  const payload = await getPayloadClient();

  const result = await payload.find({
    collection: "categories",
    depth: 0,
    /*
     * Every category, not a page of them: a filter that silently omits the
     * categories past an arbitrary cut-off is worse than a long row of
     * buttons. There are five.
     */
    limit: 0,
    locale,
    overrideAccess: false,
    sort: ["name", "id"],
    where: { isActive: { equals: true } },
  });

  return result.docs.map((category) => ({
    id: String(category.id),
    name: category.name ?? "",
  }));
}
