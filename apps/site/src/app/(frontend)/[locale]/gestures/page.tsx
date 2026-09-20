import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GestureFilters } from "@/components/GestureFilters";
import { GesturePager } from "@/components/GesturePager";
import { GestureResults } from "@/components/GestureResults";
import {
  gestureListHref,
  parseGestureListParams,
  type RawSearchParams,
  toSearchParams,
} from "@/lib/gestureListParams";
import {
  fetchCategoryOptions,
  fetchGestures,
  toGestureSummary,
} from "@/lib/gestureQuery";
import { isLocale, localeAlternates } from "@/lib/locale";
import { searchGestureIds } from "@/lib/search";

/**
 * A `generateMetadata` rather than a static `metadata`, because the
 * `alternates` have to name this path in each locale and a static export
 * cannot see the locale.
 *
 * The alternates live here rather than in the layout for the reason the
 * layout gives: Next inherits them into every child that does not declare its
 * own, so one set in the layout would make this page claim `/nl` as its
 * canonical URL.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const base = {
    description: "Blader door alle gebaren, gefilterd op categorie.",
    title: "Gebaren",
  };

  if (!isLocale(locale)) {
    return base;
  }

  return {
    ...base,
    alternates: {
      /*
       * The bare path, with no query. `?page=3&category=7` is a view of this
       * list rather than a page of its own, and a canonical URL that carried
       * the query would ask a crawler to index every filter combination.
       */
      canonical: `/${locale}/gestures`,
      languages: localeAlternates("/gestures"),
    },
  };
}

/**
 * Rendered per request, never prerendered.
 *
 * Two reasons, and the second is the one that bites. The page reads
 * `searchParams`, which already opts it out of static rendering — but the
 * parent layout's `generateStaticParams` means Next *attempts* this route
 * during `next build`, and at build time `payload.config.ts` deliberately
 * hands the D1 adapter an inert placeholder (see `BUILD_PHASE_BINDINGS`
 * there: real bindings do not exist during a build, and starting miniflare
 * per build worker deadlocks on the local SQLite file). A query from a
 * prerender would therefore fail the build rather than the request. Saying so
 * explicitly is cheaper than rediscovering it.
 */
export const dynamic = "force-dynamic";

/**
 * The gestures list.
 *
 * A Server Component that queries Payload's Local API directly — no HTTP
 * round trip, no client data layer, and **no load-all-then-filter**. The
 * `where` clause carries the category filter, `page`/`limit` carry the
 * pagination, and the row count comes back from the same query as the rows,
 * so the page numbers describe the filtered set. `apps/web/src/routes/
 * gestures.tsx` loads every gesture and narrows the array in the browser;
 * this is what replaces it.
 *
 * `params` and `searchParams` are both Promises in Next 16 — checked against
 * `node_modules/next/dist/server/request/search-params.d.ts`, whose
 * `createServerSearchParamsForServerPage` returns `Promise<SearchParams>`,
 * rather than assumed from the shape of the old API.
 *
 * The locale check is repeated from the layout on purpose: `notFound()` in a
 * layout is caught by the boundary *above* it, so the two render different
 * pages, and a page that trusts its parent serves Dutch under `/de` the day
 * someone reorders the tree.
 */
export default async function GesturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const pathname = `/${locale}/gestures`;
  const query = parseGestureListParams(toSearchParams(await searchParams));

  /*
   * `undefined` and `[]` mean different things to `fetchGestures`: the first
   * constrains nothing, the second is a search that matched nothing and must
   * show an empty page. So the blank case is decided here, and
   * `searchGestureIds` is not called at all for it — a cleared search box
   * leaves `?q=` in the URL, and that must mean "everything".
   *
   * The two searches run alongside the category options rather than after
   * them, because only `fetchGestures` depends on the ids.
   */
  const [searchIds, categories] = await Promise.all([
    query.q.trim() === "" ? undefined : searchGestureIds(query.q, locale),
    fetchCategoryOptions(locale),
  ]);

  const result = await fetchGestures({
    categories: query.categories,
    locale,
    page: query.page,
    q: query.q,
    searchIds,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">Gebaren</h1>
        <p
          className="text-foreground-muted text-sm"
          data-testid="gesture-count"
        >
          {result.totalDocs} gebaren
        </p>
      </div>

      <GestureFilters categories={categories} />

      {/*
       * The clamp is visible rather than silent. A shared link to `?page=99`
       * lands on the last page, and saying so is the difference between "this
       * is the end of the list" and "the link you were sent is broken".
       */}
      {query.page > result.totalPages ? (
        <p className="text-foreground-muted text-sm" data-testid="page-clamped">
          Pagina {query.page} bestaat niet. Dit is pagina {result.page} van{" "}
          {result.totalPages}.
        </p>
      ) : null}

      <GestureResults
        gestures={result.gestures.map(toGestureSummary)}
        locale={locale}
      />

      <GesturePager page={result.page} pageCount={result.totalPages} />

      {/*
       * A crawler with no JavaScript, and a reader whose JavaScript failed,
       * still need to reach page two. The islands above navigate with the
       * router; these are plain document links to the same URLs.
       *
       * Named "Alle pagina's" rather than something containing "Paginering":
       * two landmarks whose accessible names are prefixes of one another are
       * ambiguous to a reader jumping between landmarks, and to any test
       * that addresses them by role and name.
       */}
      <nav aria-label="Alle pagina's" className="sr-only">
        <ul>
          {Array.from(
            { length: result.totalPages },
            (_, index) => index + 1
          ).map((page) => (
            <li key={page}>
              <a href={gestureListHref(pathname, query, { page })}>
                Pagina {page}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
