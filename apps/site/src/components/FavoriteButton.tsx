"use client";

import { Button, cn } from "@smog/ui-web";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { writeAccountFavorite } from "@/lib/accountFavorites";
import { trackEvent } from "@/lib/analytics";
import { readGuestFavorites, toggleGuestFavorite } from "@/lib/guestStore";
import type { Locale } from "@/lib/locale";
import { syncGuestFavorites } from "@/lib/mergeGuestState";

/**
 * Favourite a gesture — on the account when there is one, in this browser
 * when there is not.
 *
 * ## One control, two backends
 *
 * `signedIn` is the mode switch and it is a **server-rendered** prop, not
 * something this component works out for itself. That matters for more than
 * tidiness: the detail page is already `force-dynamic` and already resolves
 * the viewer for its access check, so the answer is free there, and a heart
 * that knew who you were only after a round trip would start every page
 * visit by lying about your favorites.
 *
 * The two paths are deliberately asymmetric, because their failure modes
 * are:
 *
 * - **Signed out** is the guest path, down to the three-state
 *   dance below. `localStorage` is not readable during the server render, so
 *   "not favourited" is a claim this component cannot back up until its
 *   effect has run — and a first client render that consulted the store
 *   would produce different markup than the server sent and React would
 *   throw the tree away.
 * - **Signed in** starts from the account, which the server *did* know, so
 *   the heart is already right in the server's markup and there is no
 *   unknown state at all.
 *
 * ## `data-ready` means hydrated, and it took a regression to keep it that way
 *
 * The attribute exists because a server-rendered button is not wired to
 * anything: React has not hydrated, a press does nothing, and it does so
 * silently. It was added after the e2e suite pressed a dead button and
 * failed depending on how fast the route compiled.
 *
 * The first version of the signed-in path derived it from
 * `state !== "unknown"`, which for a signed-in reader is true *in the server's
 * markup* — so the attribute appeared before hydration,
 * `expect(heart).toHaveAttribute( "data-ready", "true")` returned instantly,
 * and six new specs pressed a dead button. Exactly the failure the attribute
 * was invented to stop, reintroduced by making the state it was derived from
 * arrive earlier.
 *
 * So it is now its own flag, set by the mount effect on **both** paths:
 * "the answer is known" and "this control is alive" are different claims,
 * and only the second one is what a test should wait for.
 *
 * ## The heart never leads the write
 *
 * There is no optimistic update on the signed-in path. The state moves only
 * when the endpoint has said what it stored — `writeAccountFavorite` sends
 * the state it wants rather than a toggle, so the answer is authoritative
 * and a retry is harmless. A filled heart over a failed write is worse than
 * a slow one: the reader closes the tab believing it was saved, and nothing
 * ever tells them otherwise.
 *
 * While a write is in flight the control is disabled, which is what keeps a
 * double press from sending a second, opposite request behind the first.
 *
 * ## It is also where the guest list follows the reader in
 *
 * Signing in cannot merge the guest favorites by itself: they are in
 * `localStorage`, which the sign-in endpoint cannot see and the server
 * render cannot read. Something in the browser has to offer them, and this
 * is the component that already knows both halves — that there is an account
 * now, and that this browser has a list from before there was one.
 *
 * So the mount effect calls `syncGuestFavorites` on the account path. It
 * costs nothing for the ordinary reader: with an empty guest list it makes
 * no request at all. **This is the only reason the account path touches
 * `localStorage`, and the list is input to a server write, never a source
 * for the heart** — the state that comes back is the account's, after the
 * merge.
 *
 * **It is not the only place the merge runs.** A reader who signs in and goes
 * straight to `/{locale}/favorites` never renders this button, so
 * `GuestFavoritesSync` in the locale layout is another caller of
 * `syncGuestFavorites` rather than a different shape for it.
 *
 * ## It reports what it did, not what it tried
 *
 * `gesture_collection_changed` fires once the outcome is known — after
 * `toggleGuestFavorite` on the guest path, after the endpoint's `ok` on the
 * account path — never before. A press that lands on `signed-out` or `failed`
 * reports nothing, because nothing changed. `collection: "favorites"` and
 * `source: "gesture_detail"` are this component's fixed values: favorites are
 * their own collection here rather than a default list named Favorites, so this
 * control's `collection` never varies. `trackEvent` itself is the consent gate;
 * this component does not check `readConsent()` a second time.
 */
export function FavoriteButton({
  className,
  gestureId,
  initialFavorite = false,
  locale,
  signedIn,
}: {
  className?: string;
  gestureId: string;
  /** Whether the account already holds this gesture. Ignored for a guest. */
  initialFavorite?: boolean;
  locale: Locale;
  signedIn: boolean;
}) {
  const [state, setState] = useState<"off" | "on" | "unknown">(() => {
    if (!signedIn) {
      return "unknown";
    }

    return initialFavorite ? "on" : "off";
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"failed" | "signed-out" | null>(null);
  const isFavorite = state === "on";

  useEffect(() => {
    /*
     * The store is never read *for this control's state* on the account
     * path. A signed-in reader's answer came from the server with the page,
     * and taking it from `localStorage` instead would show a filled heart
     * for a favourite the account does not have.
     *
     * `readGuestFavorites` never throws — see `guestStore.ts`. That matters
     * more here than anywhere else: an effect that throws during mount is an
     * unhandled error in the client tree, and React unmounts everything up
     * to the nearest error boundary. In private browsing that would blank
     * the detail page rather than merely losing the heart.
     */
    if (!signedIn) {
      setState(readGuestFavorites().includes(gestureId) ? "on" : "off");
      setReady(true);
      return;
    }

    // Unconditional, and that is the point: this says "hydrated", not "the
    // answer is known". See the note above.
    setReady(true);

    /*
     * The account path *does* read the store — once, and only to hand it to
     * the server. This is the one place in the app that knows both that
     * somebody is signed in and what this browser favourited before they
     * were, so it is where the merge is triggered from; `syncGuestFavorites`
     * makes no request at all when there is nothing to merge, which is every
     * page for almost every reader.
     *
     * The state is then taken from the *server's* answer — the account's
     * whole list after the merge — and never from the local array. That
     * distinction is the whole design: the local ids are input to a write,
     * not a second source of truth. It also repaints a heart the server
     * rendered before the merge existed, which is the visible half of
     * "guest state follows the account".
     *
     * `syncGuestFavorites` never throws and never reports a merge it did not
     * get an answer for, so a failure here leaves both the heart and the
     * local array exactly where they were — and the next signed-in page
     * tries again, which is safe because the server half is idempotent.
     */
    let live = true;

    syncGuestFavorites().then((merge) => {
      if (live && merge.status === "merged") {
        setState(merge.favorites.includes(gestureId) ? "on" : "off");
      }
    });

    return () => {
      live = false;
    };
  }, [gestureId, signedIn]);

  const pressGuest = () => {
    const nowFavorite = toggleGuestFavorite(gestureId).includes(gestureId);
    setState(nowFavorite ? "on" : "off");
    trackEvent("gesture_collection_changed", {
      action: nowFavorite ? "added" : "removed",
      collection: "favorites",
      gesture_id: gestureId,
      source: "gesture_detail",
    });
  };

  const pressAccount = async () => {
    /*
     * The second lock. `disabled={busy}` below is the first, and it is the
     * one a mutation sweep proved bites — removing *this* guard alone failed
     * nothing, because a disabled button does not deliver a click. It stays
     * because `disabled` is a rendering concern that a restyle can drop, and
     * because a caller that is not a click — a keyboard shortcut, a future
     * "favourite all" — would not be stopped by it.
     */
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await writeAccountFavorite({
      favorite: !isFavorite,
      gestureId,
    });

    setBusy(false);

    if (result.status === "ok") {
      setState(result.favorite ? "on" : "off");
      trackEvent("gesture_collection_changed", {
        action: result.favorite ? "added" : "removed",
        collection: "favorites",
        gesture_id: gestureId,
        source: "gesture_detail",
      });
      return;
    }

    /*
     * The state is left exactly where it was. `signed-out` is the session
     * expiring while the page sat open: the header still shows the account
     * it was rendered with, so without this message the press would look
     * like it worked and the favourite would be nowhere.
     */
    setError(result.status);
  };

  return (
    <div className={cn("flex flex-col items-end gap-2", className)}>
      <Button
        aria-busy={busy}
        aria-label="Favoriet"
        /*
         * One accessible name in both states, with the state on
         * `aria-pressed`. Swapping the label between "add" and "remove"
         * announces a different control each time it is pressed. Same rule as
         * `GestureCard`'s control, deliberately.
         */
        aria-pressed={isFavorite}
        /*
         * Absent rather than `"false"` until the control is wired up: a test
         * that waits for `[data-ready]` should not match a button that is
         * still inert, and an attribute whose value has to be read to know
         * that is one more thing to get wrong.
         */
        data-ready={ready ? "true" : undefined}
        disabled={busy}
        onClick={() => {
          if (signedIn) {
            pressAccount();
            return;
          }

          pressGuest();
        }}
        size="icon"
        variant="ghost"
      >
        <Heart
          aria-hidden="true"
          className={cn("size-5", isFavorite && "fill-current")}
        />
      </Button>

      {error === null ? null : (
        /*
         * `<output>` rather than a `<p role="alert">`. Its implicit role is
         * `status`, which is the polite live region this wants: the press
         * failed, nothing is lost and nothing is urgent, where an `alert`
         * interrupts whatever a screen reader is saying. It is also the
         * element the linter insists on for that role, and it is right to.
         */
        <output
          className="block max-w-xs text-right font-medium text-danger text-sm"
          data-testid="favorite-error"
        >
          {error === "signed-out" ? (
            <>
              Je sessie is verlopen.{" "}
              <a
                className="underline underline-offset-2"
                href={`/${locale}/sign-in`}
              >
                Meld je opnieuw aan
              </a>{" "}
              om dit gebaar te bewaren.
            </>
          ) : (
            "Bewaren is niet gelukt. Probeer het opnieuw."
          )}
        </output>
      )}
    </div>
  );
}
