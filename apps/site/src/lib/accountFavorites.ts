import type { User } from "@/payload-types";
import { isGestureId } from "./favoritesQuery";

/**
 * Favorites that belong to an account rather than to a browser.
 *
 * The guest half of this lives in `guestStore.ts` and is unchanged. This is
 * the other backend behind the same controls, and the two are deliberately
 * kept in separate modules: `guestStore` must never throw and never talks to
 * the network, this one is all network and reports its failures. A single
 * module doing both would blur the one property each of them is held to.
 *
 * **Nothing here imports Payload.** It is pulled into two client components,
 * and `favoritesQuery.ts` records what an accidental edge into
 * `payloadClient` costs: 519 KiB gzipped. The only Payload thing referenced
 * is the generated `User` *type*, which erases.
 */

/**
 * Where the browser posts a favourite change.
 *
 * A `next.config.ts` rewrite onto a Payload endpoint at
 * `/api/account/favorites`, for the same measured reason the auth endpoints
 * are: an `app/**​/route.ts` that imports Payload is its own bundle entry and
 * re-bundles the Payload/D1/drizzle graph into it. See
 * `endpoints/favorites.ts`.
 */
export const ACCOUNT_FAVORITES_PATH = "/account/favorites";

/**
 * What a write to the account can turn out to be.
 *
 * Three outcomes and not two, because "your session ended" is not the same
 * thing as "that did not work" and the two want different words on the
 * screen. A reader whose cookie expired while the tab was open needs to be
 * told to sign in again; a reader whose request timed out needs to be told
 * to try again. Collapsing them produces one message that is wrong for both.
 *
 * Not exported: nothing outside this module names it, and `knip` — which CI
 * runs — fails the build on an exported symbol nothing imports. Callers read
 * it structurally off the two functions below.
 */
type FavoriteWrite =
  | { status: "failed" }
  | { favorite: boolean; status: "ok" }
  | { status: "signed-out" };

/**
 * The gesture ids favourited on an account, as strings.
 *
 * `users.favorites` is a `hasMany` relationship, so an entry is a bare id at
 * `depth: 0` and a populated document above it — both shapes are normal and
 * which one arrives depends on the caller's `depth`, not on anything this
 * function can see.
 *
 * Filtered through `isGestureId` for the same reason the guest list is: the
 * ids go on to build a `where[id][in]` query, where a non-numeric entry
 * becomes `NaN` rather than being rejected. Deduplicated as well, because
 * `Users.ts`'s `beforeChange` hook is what enforces one-per-gesture in
 * storage and a row written before that hook existed is still in the
 * database.
 */
export function accountFavoriteIds(user: null | User): string[] {
  if (user === null || !Array.isArray(user.favorites)) {
    return [];
  }

  const ids = user.favorites.map((entry) =>
    typeof entry === "object" && entry !== null
      ? String(entry.id)
      : String(entry)
  );

  return [...new Set(ids.filter(isGestureId))];
}

/** Whether this account has already favourited this gesture. */
export function isAccountFavorite(
  user: null | User,
  gestureId: string
): boolean {
  return accountFavoriteIds(user).includes(gestureId);
}

/**
 * The answer the endpoint sends back, narrowed.
 *
 * Exported so the shape is pinned by a test of its own rather than only
 * through a `fetch` stub: the field the controls key off is a boolean, and
 * `undefined` is falsy, so a body that lost the field would otherwise read
 * as "not favourited" and quietly un-fill every heart.
 */
export function readFavoriteWrite(body: unknown): FavoriteWrite {
  if (typeof body !== "object" || body === null) {
    return { status: "failed" };
  }

  const { favorite } = body as { favorite?: unknown };

  return typeof favorite === "boolean"
    ? { favorite, status: "ok" }
    : { status: "failed" };
}

/**
 * Writes one favourite to the signed-in account.
 *
 * **It sends the state it wants, not "toggle".** That is what makes the
 * whole path idempotent, and idempotence is not optional here: there are no
 * transactions on any write path in this app, a double-submitted press is
 * ordinary, and a second sign-in on the same browser re-runs the guest merge
 * over the same ids. `{ favorite: true }` twice leaves one favourite;
 * `{ toggle: true }` twice leaves none, which is a control that undoes
 * itself when the network stutters.
 *
 * **It never throws, and it never lies.** A caller that got anything other
 * than `ok` must leave the control showing what the account actually holds —
 * an optimistic heart over a failed write is worse than a slow one, because
 * the reader closes the tab believing it was saved.
 */
export async function writeAccountFavorite({
  favorite,
  gestureId,
}: {
  favorite: boolean;
  gestureId: string;
}): Promise<FavoriteWrite> {
  try {
    const response = await fetch(ACCOUNT_FAVORITES_PATH, {
      body: JSON.stringify({ favorite, gestureId }),
      /*
       * The answer is this reader's own state. A shared cache holding one
       * would hand it to the next person through the same proxy — the
       * endpoint says `no-store` too, and both ends saying it is cheap.
       */
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    /*
     * 401 is the case that has to be decided: the session expired while the
     * page was open. The page still shows the account nav it was rendered
     * with, so the reader believes they are signed in and the heart would
     * otherwise appear to work. It is called out separately here so the
     * control can say what actually happened.
     */
    if (response.status === 401) {
      return { status: "signed-out" };
    }

    if (!response.ok) {
      return { status: "failed" };
    }

    return readFavoriteWrite(await response.json());
  } catch (error) {
    // A dropped connection, an aborted navigation, a body that is not JSON.
    // None of them is worth taking the page down for, and all of them mean
    // the same thing to the reader.
    console.error("[accountFavorites] Failed to save the favourite:", error);

    return { status: "failed" };
  }
}
