"use client";

import { CategoryFilter, type CategoryOption, SearchBar } from "@smog/ui-web";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  gestureListHref,
  parseGestureListParams,
} from "@/lib/gestureListParams";

/**
 * The search box and the category toggles, as one client island.
 *
 * **They hold no results and no state.** Every change is pushed into the URL
 * and the Server Component above re-queries the database — which is the whole
 * point of the task. `apps/web` keeps the filter state in React, loads every
 * gesture once and narrows the array; that cannot paginate honestly and
 * cannot be shared as a link.
 *
 * `"use client"` because `useRouter`, `usePathname` and `useSearchParams` are
 * client hooks, and because `CategoryFilter` and `SearchBar` take `onChange`
 * and `onSearch` — function props, which cannot cross a server boundary.
 *
 * The current state is read back from the URL rather than from props, so this
 * component and the pagination below it cannot disagree about where the
 * visitor is. `gestureListHref` owns the "changing a filter returns to page
 * one" rule; neither island reimplements it.
 */
export function GestureFilters({
  categories,
}: {
  categories: readonly CategoryOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = parseGestureListParams(search);

  return (
    <div className="flex flex-col gap-4">
      {/*
       * `key` on the query, so clearing the box or arriving from a shared
       * link re-mounts the field with the right text. `SearchBar` owns its
       * input and reads `defaultValue` once.
       */}
      <SearchBar
        defaultValue={current.q}
        key={current.q}
        label="Zoek een gebaar"
        onSearch={(q) => router.push(gestureListHref(pathname, current, { q }))}
        placeholder="Zoek een gebaar"
      />
      <CategoryFilter
        categories={categories}
        onChange={(next) =>
          router.push(gestureListHref(pathname, current, { categories: next }))
        }
        selectedIds={current.categories}
      />
    </div>
  );
}
