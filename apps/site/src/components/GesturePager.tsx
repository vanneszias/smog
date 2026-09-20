"use client";

import { Pagination } from "@smog/ui-web";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  gestureListHref,
  parseGestureListParams,
} from "@/lib/gestureListParams";

/**
 * Pagination that navigates rather than re-renders.
 *
 * `"use client"` for `onPageChange` and the three location hooks. `page` and
 * `pageCount` come from the server, because they are properties of the
 * database's answer and not of anything this component can see: `pageCount`
 * is derived from the *filtered* total, and `page` is the clamped one, so a
 * visitor who asked for page 99 is told they are on the last page rather than
 * on a page that does not exist.
 */
export function GesturePager({
  page,
  pageCount,
}: {
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = parseGestureListParams(useSearchParams());

  return (
    <Pagination
      onPageChange={(next) =>
        router.push(gestureListHref(pathname, current, { page: next }))
      }
      page={page}
      pageCount={pageCount}
    />
  );
}
