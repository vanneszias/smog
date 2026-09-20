"use client";

import { GestureGrid, type GestureSummary } from "@smog/ui-web";
import Link from "next/link";
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
 */
export function GestureResults({
  gestures,
  locale,
}: {
  gestures: readonly GestureSummary[];
  locale: Locale;
}) {
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
