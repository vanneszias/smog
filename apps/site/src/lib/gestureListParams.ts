/**
 * The gestures list's query string: reading it, and writing the next one.
 *
 * Kept apart from `gestureQuery.ts` — which talks to the database — because
 * this half runs in three places that cannot share an implementation any
 * other way: the Server Component reading `searchParams`, the filter island
 * and the pagination island, both of which read `useSearchParams()`. Two of
 * the three writing their own URL is how a filter change quietly keeps you on
 * page 3 of a one-page result.
 */

/** The shape Next hands a Server Component's `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface GestureListQuery {
  q: string;
  categories: string[];
  page: number;
}

const CATEGORY_KEY = "category";
const PAGE_KEY = "page";
const QUERY_KEY = "q";
const FIRST_PAGE = 1;

/**
 * Normalizes a Server Component's `searchParams` into the same
 * `URLSearchParams` the client islands get from `useSearchParams()`.
 *
 * `searchParams` is a `Promise` in Next 16 — verified at the call site
 * against `createServerSearchParamsForServerPage` in
 * `node_modules/next/dist/server/request/search-params.d.ts`, which returns
 * `Promise<SearchParams>` — and resolves to a plain object whose values are
 * `string | string[] | undefined`. Repeated keys arrive as an array, so they
 * are appended rather than joined: `getAll` below then sees them all.
 */
export function toSearchParams(raw: RawSearchParams): URLSearchParams {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        search.append(key, entry);
      }
    } else {
      search.append(key, value);
    }
  }

  return search;
}

/**
 * Reads the list's state out of a query string.
 *
 * `category` is accepted both as a repeated key and as one comma-separated
 * value, because the comma form is what existing links carry, and those are
 * already pasted into documents and chat messages. Emitting the comma form (see
 * `gestureListHref`) keeps those links working unchanged.
 *
 * Every value is defended rather than trusted — this is a URL a stranger can
 * type. Blank category ids are dropped, because `?category=,` would otherwise
 * become `{ in: [""] }` and empty the page, and a non-numeric `page` becomes
 * the first page rather than `NaN`.
 */
export function parseGestureListParams(
  search: URLSearchParams
): GestureListQuery {
  const categories = search
    .getAll(CATEGORY_KEY)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const page = Number.parseInt(search.get(PAGE_KEY) ?? "", 10);

  return {
    categories,
    page: Number.isFinite(page) && page >= FIRST_PAGE ? page : FIRST_PAGE,
    q: search.get(QUERY_KEY) ?? "",
  };
}

/**
 * The URL for the next state of the list.
 *
 * **Changing a filter returns to the first page.** That is the rule this
 * function exists to hold: a visitor on page 3 who picks a category with one
 * page of results would otherwise be sent to page 3 of 1 — an empty grid
 * under a filter that matched plenty. Clamping in `fetchGestures` stops that
 * being an error, but the URL would still lie about where they are.
 *
 * So a patch that touches `q` or `categories` resets `page`, and only an
 * explicit `page` in the patch survives. Pagination passes `page` and nothing
 * else; the filters pass everything else and never a page.
 *
 * Defaults are omitted rather than written out — no `?q=`, no `?page=1` —
 * so the unfiltered list has exactly one URL instead of four.
 */
export function gestureListHref(
  pathname: string,
  current: GestureListQuery,
  patch: Partial<GestureListQuery>
): string {
  const touchesFilters = QUERY_KEY in patch || "categories" in patch;

  const next: GestureListQuery = {
    categories: patch.categories ?? current.categories,
    page: patch.page ?? (touchesFilters ? FIRST_PAGE : current.page),
    q: patch.q ?? current.q,
  };

  const search = new URLSearchParams();

  if (next.q.trim() !== "") {
    search.set(QUERY_KEY, next.q);
  }

  if (next.categories.length > 0) {
    search.set(CATEGORY_KEY, next.categories.join(","));
  }

  if (next.page > FIRST_PAGE) {
    search.set(PAGE_KEY, String(next.page));
  }

  const query = search.toString();

  return query === "" ? pathname : `${pathname}?${query}`;
}
