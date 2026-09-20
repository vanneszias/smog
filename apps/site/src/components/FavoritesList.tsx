"use client";

import {
  Button,
  EmptyState,
  GestureGrid,
  type GestureSummary,
} from "@smog/ui-web";
import { HeartOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  favoriteGesturesUrl,
  readFavoriteGestures,
  usableFavoriteIds,
} from "@/lib/favoritesQuery";
import { readGuestFavorites, toggleGuestFavorite } from "@/lib/guestStore";
import type { Locale } from "@/lib/locale";

/**
 * The three things this list can be.
 *
 * `loading` is the *initial* value and that is the whole design. The server
 * cannot know what the guest favourited, so the first paint has to say
 * "looking" rather than "nothing" — an empty state that appears for a tick
 * and is then replaced by six cards is a visible bug, and it is what any
 * implementation that starts at `ready` with an empty array produces.
 */
type FavoritesState =
  | { status: "loading" }
  | { status: "ready"; gestures: GestureSummary[] }
  | { status: "failed" };

/**
 * A guest's favorites, resolved in the browser.
 *
 * `"use client"` because the ids are in `localStorage` and nowhere else. The
 * gestures themselves still come from the server: the ids go to Payload's own
 * `/api/gestures` as an anonymous request, so `publicReadActive` decides what
 * comes back. `favoritesQuery.ts` builds that request and narrows the answer,
 * and says there why it is a query builder rather than a route of our own —
 * the short version is 519 KiB of Worker bundle.
 *
 * Three ordering rules, each of which is a bug when broken:
 *
 * - the first paint is placeholders. See `FavoritesState`.
 * - a favourite that no longer resolves — deleted, or deactivated since it
 *   was saved — is silently absent rather than an error. The list is a set of
 *   bookmarks.
 * - un-favouriting removes the card immediately and does not re-fetch. The
 *   server has nothing new to say, and a round trip would make the press feel
 *   broken.
 */
export function FavoritesList({ locale }: { locale: Locale }) {
  const [state, setState] = useState<FavoritesState>({ status: "loading" });

  useEffect(() => {
    /*
     * `readGuestFavorites` never throws, so a denied store lands here as an
     * empty list and the page renders "no favorites yet". An effect that
     * threw would be an unhandled error in the client tree and would blank
     * everything below the nearest boundary — the failure mode Review Focus
     * item 3 is about.
     */
    const ids = usableFavoriteIds(readGuestFavorites());

    if (ids.length === 0) {
      setState({ gestures: [], status: "ready" });
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(favoriteGesturesUrl(ids, locale), {
          // The answer is keyed on a list this reader assembled, and it
          // changes the moment an editor deactivates one of the gestures in
          // it. Nothing in between should keep a copy.
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`favorites lookup returned ${response.status}`);
        }

        const gestures = readFavoriteGestures(await response.json(), ids);

        if (gestures === null) {
          throw new Error("favorites lookup returned an unexpected shape");
        }

        setState({ gestures, status: "ready" });
      } catch (error) {
        // An abort is this component unmounting, not a failure, and setting
        // state from it would both mislead and warn.
        if (controller.signal.aborted) {
          return;
        }

        console.error("[favorites] Failed to load favourite gestures:", error);
        setState({ status: "failed" });
      }
    };

    load();

    return () => controller.abort();
  }, [locale]);

  const unfavorite = useCallback((id: string) => {
    const remaining = toggleGuestFavorite(id);

    setState((current) =>
      current.status === "ready"
        ? {
            gestures: current.gestures.filter((gesture) =>
              remaining.includes(gesture.id)
            ),
            status: "ready",
          }
        : current
    );
  }, []);

  if (state.status === "loading") {
    return (
      <GestureGrid
        gestures={[]}
        label="Favorieten"
        loading={true}
        loadingLabel="Favorieten laden"
      />
    );
  }

  if (state.status === "failed") {
    return (
      <EmptyState
        description="Probeer de pagina opnieuw te laden. Je favorieten staan nog in deze browser."
        icon={<HeartOff aria-hidden="true" className="size-8" />}
        title="Favorieten konden niet geladen worden"
      />
    );
  }

  return (
    <GestureGrid
      emptyAction={
        <Button asChild={true}>
          <Link href={`/${locale}/gestures`}>Blader door gebaren</Link>
        </Button>
      }
      emptyDescription="Tik op het hartje bij een gebaar om het hier te bewaren."
      emptyIcon={<HeartOff aria-hidden="true" className="size-8" />}
      emptyTitle="Nog geen favorieten"
      favoriteIds={state.gestures.map((gesture) => gesture.id)}
      gestures={state.gestures}
      label="Favorieten"
      onFavorite={unfavorite}
      renderGestureLink={(gesture, children) => (
        <Link href={`/${locale}/gestures/${gesture.id}`}>{children}</Link>
      )}
    />
  );
}
