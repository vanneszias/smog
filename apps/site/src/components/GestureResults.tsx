"use client";

import { GestureGrid, type GestureSummary } from "@smog/ui-web";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";
import { parseGestureListParams } from "@/lib/gestureListParams";
import type { Locale } from "@/lib/locale";

/**
 * The grid, wrapped so it can be given a link.
 *
 * `GestureGrid` takes `renderGestureLink`, a *function*, and a function
 * cannot be serialized across the server/client boundary — so the page cannot
 * hand it one and this wrapper exists to supply it on the client side. The
 * rows themselves are still fetched and flattened on the server; what crosses
 * the boundary is plain data.
 *
 * The detail route lands in Task 5. The links are built now rather than later
 * because a card nobody can click is not a list of gestures, and because the
 * href shape is what Task 5 has to match.
 *
 * It is also where `search_performed` fires. That event needs the *results*
 * of a query — `has_results`, `result_count` — and on this route those only
 * exist once the Server Component above has re-queried the database, so the
 * effect belongs beside the data it needs rather than beside the search box
 * that started the round trip (`GestureFilters.tsx`, which has neither).
 */
export function GestureResults({
  gestures,
  locale,
}: {
  gestures: readonly GestureSummary[];
  locale: Locale;
}) {
  const searchParams = useSearchParams();
  const { categories, q } = parseGestureListParams(searchParams);

  /*
   * A key of the filters alone, deliberately excluding `page`. Paging
   * through the same search is not a new search, and without this a click
   * on "next page" would fire another `search_performed` for a query that
   * has not changed — a page did.
   */
  const filterKey = `${q}\u0000${[...categories].sort().join(",")}`;
  const lastReported = useRef<string | null>(null);

  useEffect(() => {
    if (filterKey === lastReported.current) {
      return;
    }

    lastReported.current = filterKey;

    /*
     * Matches `apps/web/src/routes/gestures.tsx:74-90`: nothing is reported
     * for the unfiltered list, only for an actual query or an actual
     * category selection. A visitor who lands on `/gestures` with no
     * `?q=` and no `?category=` has not performed a search.
     */
    if (q.trim() === "" && categories.length === 0) {
      return;
    }

    trackEvent("search_performed", {
      category_count: categories.length,
      has_results: gestures.length > 0,
      query_length: q.trim().length,
      result_count: gestures.length,
      source: "filter_change",
    });
    /*
     * `filterKey` is what actually gates whether the body below runs (via
     * `lastReported`), but `categories` and `q` are read inside it too, so
     * both are listed here as well — a fresh array/string each render, which
     * only means this effect *runs* more often than the event *fires*.
     */
  }, [filterKey, gestures.length, categories, q]);

  return (
    <GestureGrid
      emptyDescription="Pas je zoekopdracht of je filters aan."
      emptyTitle="Geen gebaren gevonden"
      gestures={gestures}
      label="Gebaren"
      renderGestureLink={(gesture, children) => (
        <Link href={`/${locale}/gestures/${gesture.id}`}>{children}</Link>
      )}
    />
  );
}
