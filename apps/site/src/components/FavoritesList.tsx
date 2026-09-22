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
import { writeAccountFavorite } from "@/lib/accountFavorites";
import { trackEvent } from "@/lib/analytics";
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
 * `loading` is the *initial* value and that is the whole design. Even for a
 * signed-in reader, whose ids arrive with the page, the *gestures* do not —
 * they are fetched — so an empty state that appears for a tick and is then
 * replaced by six cards is a visible bug, and it is what any implementation
 * that starts at `ready` with an empty array produces.
 */
type FavoritesState =
  | { status: "loading" }
  | { gestures: GestureSummary[]; status: "ready" }
  | { status: "failed" };

/**
 * A reader's favorites — from their account when they have one, from this
 * browser when they do not.
 *
 * `"use client"` because the guest's ids are in `localStorage` and nowhere
 * else, and because un-favouriting is an interaction. The gestures themselves
 * still come from the server either way: the ids go to Payload's own
 * `/api/gestures` as an anonymous request, so `publicReadActive` decides what
 * comes back. `favoritesQuery.ts` builds that request and narrows the answer,
 * and says there why it is a query builder rather than a route of our own —
 * the short version is 519 KiB of Worker bundle.
 *
 * **`accountFavoriteIds` is the mode switch, and `null` means "guest".** It
 * is resolved on the server, in the page above, rather than fetched here:
 * that page is rendered per request anyway, the ids are three fields off a
 * user document the header already loaded, and a list that asked the network
 * who it belonged to would paint the *guest's* favorites first and then swap
 * them out.
 *
 * Four ordering rules, each of which is a bug when broken:
 *
 * - the first paint is placeholders. See `FavoritesState`.
 * - a favourite that no longer resolves — deleted, or deactivated since it
 *   was saved — is silently absent rather than an error. The list is a set of
 *   bookmarks.
 * - un-favouriting a *guest* favourite removes the card immediately and does
 *   not re-fetch. The server has nothing new to say, and a round trip would
 *   make the press feel broken.
 * - un-favouriting an *account* favourite removes the card only once the
 *   write has been acknowledged. A card that vanishes on a write that failed
 *   is a lie the reader only discovers on their next visit.
 */
export function FavoritesList({
  accountFavoriteIds,
  locale,
}: {
  /** The account's favourite ids, or `null` for a signed-out reader. */
  accountFavoriteIds: null | string[];
  locale: Locale;
}) {
  const [state, setState] = useState<FavoritesState>({ status: "loading" });
  const [writeError, setWriteError] = useState<"failed" | "signed-out" | null>(
    null
  );

  useEffect(() => {
    /*
     * `readGuestFavorites` never throws, so a denied store lands here as an
     * empty list and the page renders "no favorites yet". An effect that
     * threw would be an unhandled error in the client tree and would blank
     * everything below the nearest boundary — the failure mode Stage 3's
     * Review Focus item 3 is about, and one this component is still on the
     * hook for on the guest path.
     */
    const ids = usableFavoriteIds(accountFavoriteIds ?? readGuestFavorites());

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
  }, [accountFavoriteIds, locale]);

  const drop = useCallback((id: string) => {
    setState((current) =>
      current.status === "ready"
        ? {
            gestures: current.gestures.filter((gesture) => gesture.id !== id),
            status: "ready",
          }
        : current
    );
  }, []);

  /*
   * `source: "gesture_list"` rather than a new value of its own: the
   * vocabulary in `packages/shared/src/analytics.ts` only names
   * "gesture_detail" | "gesture_list" | "search_results", this page is a
   * grid of gesture cards exactly like the browse listing (`GestureResults`,
   * which reports the same value), and this stage adds no new event names or
   * property values (Task 7's brief). Reported only once removal is
   * confirmed — a guest press that did not actually remove anything, or an
   * account write that failed, changed nothing and reports nothing.
   */
  const unfavorite = useCallback(
    async (id: string) => {
      if (accountFavoriteIds === null) {
        const remaining = toggleGuestFavorite(id);

        if (!remaining.includes(id)) {
          drop(id);
          trackEvent("gesture_collection_changed", {
            action: "removed",
            collection: "favorites",
            gesture_id: id,
            source: "gesture_list",
          });
        }

        return;
      }

      const result = await writeAccountFavorite({
        favorite: false,
        gestureId: id,
      });

      if (result.status !== "ok") {
        setWriteError(result.status);
        return;
      }

      setWriteError(null);
      drop(id);
      trackEvent("gesture_collection_changed", {
        action: "removed",
        collection: "favorites",
        gesture_id: id,
        source: "gesture_list",
      });
    },
    [accountFavoriteIds, drop]
  );

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
        description="Probeer de pagina opnieuw te laden. Je favorieten zijn niet verloren."
        icon={<HeartOff aria-hidden="true" className="size-8" />}
        title="Favorieten konden niet geladen worden"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {writeError === null ? null : (
        /*
         * `<output>` for its implicit `status` role: a polite live region,
         * because a favourite that would not budge is worth announcing and
         * is not worth interrupting for.
         */
        <output
          className="block rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="favorites-error"
        >
          {writeError === "signed-out" ? (
            <>
              Je sessie is verlopen.{" "}
              <a
                className="underline underline-offset-2"
                href={`/${locale}/sign-in`}
              >
                Meld je opnieuw aan
              </a>{" "}
              om je favorieten aan te passen.
            </>
          ) : (
            "Aanpassen is niet gelukt. Probeer het opnieuw."
          )}
        </output>
      )}

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
        onFavorite={(id) => {
          unfavorite(id);
        }}
        renderGestureLink={(gesture, children) => (
          <Link href={`/${locale}/gestures/${gesture.id}`}>{children}</Link>
        )}
      />
    </div>
  );
}
