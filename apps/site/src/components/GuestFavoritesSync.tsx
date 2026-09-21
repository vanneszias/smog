"use client";

import { useEffect } from "react";
import { syncGuestFavorites } from "@/lib/mergeGuestState";

/**
 * Carries this browser's guest favorites into the account, on the first
 * signed-in page of any kind.
 *
 * ## Why this exists at all, when `FavoriteButton` already merges
 *
 * Because `FavoriteButton` renders on exactly one page — the gesture detail
 * page — and **sign-in redirects to the home page** (`endpoints/auth.ts`
 * answers a successful sign-in with `seeOther(homePath(locale))`). So the
 * merge that `FavoriteButton` triggers does not happen at sign-in; it happens
 * whenever the reader next opens a gesture, which may be never. Stage 4 exit
 * criterion 6 asks for the favorites to merge *on first sign-in*, and without
 * this component they do not.
 *
 * It renders `null`. It is a place to hang one effect, not a piece of UI.
 *
 * ## Why a client leaf in a server layout is the right shape
 *
 * `AccountNav` argues against putting a `"use client"` boundary in the layout
 * of every page — but that argument is about turning *the nav itself* into a
 * disclosure menu, which would drag an `aria-expanded`, an escape handler and
 * real interactive markup across the boundary to hide a single link. This is
 * the opposite: a leaf with no markup, no props and no state. It does not
 * make the layout a client component — the layout stays a server component
 * and renders this as a child — so the cost is one small effect, not a
 * client-rendered header.
 *
 * ## Why it is mounted only when signed in
 *
 * The layout already reads the session for `AccountNav`, so the check is
 * free, and a guest has nothing to merge *into*. Mounting it for everybody
 * would ship an effect to every anonymous reader that could only ever decide
 * to do nothing — and `/{locale}` is the most-visited page on the site.
 *
 * `syncGuestFavorites` never throws and makes no request at all when the
 * local array is empty, which is every page for almost every reader. On a
 * gesture page it and `FavoriteButton` both fire; that posts the same ids
 * twice, which the server half is idempotent against on purpose. See the
 * note in `lib/mergeGuestState.ts` for why they are not de-duplicated.
 */
export function GuestFavoritesSync() {
  useEffect(() => {
    /*
     * Nothing is done with the answer, and there is no cleanup flag, because
     * this component renders nothing: there is no state to set after an
     * unmounted navigation and so nothing to guard. `FavoriteButton` keeps
     * its `live` flag because it repaints a heart from the result.
     *
     * Called bare rather than awaited or `catch`-ed. `syncGuestFavorites`
     * resolves on every failure path and never rejects, so there is no
     * unhandled rejection here — the same reason `FavoriteButton` chains a
     * plain `.then` onto it.
     */
    syncGuestFavorites();
  }, []);

  return null;
}
