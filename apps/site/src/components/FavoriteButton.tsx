"use client";

import { Button, cn } from "@smog/ui-web";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { readGuestFavorites, toggleGuestFavorite } from "@/lib/guestStore";

/**
 * Favourite a gesture, as a guest.
 *
 * `"use client"` because the answer lives in `localStorage`, which the server
 * cannot see, and because the control has an `onClick`. It is the smallest
 * thing on the detail page that needs the directive — the page around it
 * stays a Server Component.
 *
 * **The state is read in an effect and not during the first render**, and
 * that is a correctness requirement rather than a preference. The server
 * renders this button with no knowledge of what the guest favourited, so a
 * first client render that consulted `localStorage` would produce different
 * markup than the server sent and React would discard the tree. The heart
 * therefore fills a tick after hydration; the alternative is a hydration
 * mismatch on every favourited gesture.
 *
 * Which is why there are **three** states and not two. Until the effect has
 * run, "not favourited" is a claim this component cannot back up, and the
 * server-rendered button is not wired to anything yet — a press before
 * hydration does nothing at all, silently. `data-ready` marks the moment the
 * control starts meaning what it says. It is what the e2e suite waits for,
 * and it was added because without it that suite pressed a dead button and
 * failed intermittently depending on how fast the page compiled.
 *
 * Nothing here identifies the guest. There is no id, no anonymous account and
 * no request to the server — Stage 4 adds the sync path, and until then the
 * page below the button says so.
 */
export function FavoriteButton({
  className,
  gestureId,
}: {
  className?: string;
  gestureId: string;
}) {
  const [state, setState] = useState<"unknown" | "on" | "off">("unknown");
  const isFavorite = state === "on";

  useEffect(() => {
    /*
     * `readGuestFavorites` never throws — see `guestStore.ts`. That matters
     * more here than anywhere else: an effect that throws during mount is an
     * unhandled error in the client tree, and React unmounts everything up
     * to the nearest error boundary. In private browsing that would blank
     * the detail page rather than merely losing the heart.
     *
     * A denied store therefore resolves to `"off"` rather than staying
     * `"unknown"`: the control works for the rest of the visit, it just
     * cannot remember anything after it.
     */
    setState(readGuestFavorites().includes(gestureId) ? "on" : "off");
  }, [gestureId]);

  return (
    <Button
      aria-label="Favoriet"
      /*
       * One accessible name in both states, with the state on
       * `aria-pressed`. Swapping the label between "add" and "remove"
       * announces a different control each time it is pressed. Same rule as
       * `GestureCard`'s control, deliberately.
       */
      aria-pressed={isFavorite}
      className={className}
      /*
       * Absent rather than `"false"` until the effect has run: a test that
       * waits for `[data-ready]` should not match a button that is still
       * inert, and an attribute whose value has to be read to know that is
       * one more thing to get wrong.
       */
      data-ready={state === "unknown" ? undefined : "true"}
      onClick={() =>
        setState(
          toggleGuestFavorite(gestureId).includes(gestureId) ? "on" : "off"
        )
      }
      size="icon"
      variant="ghost"
    >
      <Heart
        aria-hidden="true"
        className={cn("size-5", isFavorite && "fill-current")}
      />
    </Button>
  );
}
