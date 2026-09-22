import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Guest favorites, kept on the device.
 *
 * The mobile twin of `apps/site/src/lib/guestStore.ts`: same keys, same
 * toggle semantics, `AsyncStorage` in place of `localStorage`. The product
 * decision behind it is the same one that file records — a guest keeps this
 * state locally and is prompted to sign in to have it synced, so there is
 * deliberately **no guest identity** here: no generated id, no anonymous
 * account, no server-side row. A row of ids in `AsyncStorage` and nothing
 * else.
 *
 * **Every function in this module degrades to "no favorites" and none of
 * them throws.** That is the same discipline `guestStore.ts` documents as
 * Review Focus item 3, and it holds here for the same reasons, adjusted for
 * the platform:
 *
 * - `AsyncStorage` is a native module. A broken install, a full disk, or the
 *   handful of Android devices that ship without a working implementation
 *   all surface as a rejected promise rather than a thrown exception, but
 *   the effect on a caller is the same: something a render cannot survive if
 *   it is allowed to propagate.
 * - the stored value can be absent, not JSON at all, JSON that is not an
 *   array, or an array holding things that are not ids — this app wrote it,
 *   but an older build, a half-finished write, or a value edited through a
 *   debug bridge can all leave a shape that is not `string[]`, and
 *   `JSON.parse` is happy to hand back any of them.
 *
 * A screen that throws while rendering favorites is a blank screen. Every
 * path below is written so the worst outcome is an empty list.
 */

/**
 * Namespaced for the same reason `guestStore.ts`'s key is: a bare
 * `"favorites"` is the kind of key two unrelated features would pick
 * independently, and this app shares its `AsyncStorage` database with
 * whatever else this app ever stores there (see `session.ts`'s
 * `INSTALL_MARKER`).
 */
export const GUEST_FAVORITES_KEY = "smog.guest.favorites";

/**
 * How many favourite ids `data/favorites.ts` resolves into cards in one
 * request — **not** a limit on how many this module will store.
 *
 * `guestStore.ts`, read for this value as the brief instructed, turns out to
 * enforce no storage cap at all — its test suite has no "does not grow
 * without bound" case, and neither `toggleGuestFavorite` nor
 * `readGuestFavorites` there bounds the array. An earlier version of this
 * module took that gap as licence to invent a storage cap of its own,
 * truncating `AsyncStorage` with `.slice(-MAX_GUEST_FAVORITES)` on every
 * write past it — which is not matching the web's semantics, it is silently
 * deleting the reader's oldest favourite to satisfy a bound nothing shipped
 * ever asked for. Fixed: **every id this module is asked to store, it
 * stores**, exactly like `guestStore.ts`. `MAX_GUEST_FAVORITES` is kept as
 * the *query-time* bound instead, matching `favoritesQuery.ts`'s
 * `MAX_FAVORITE_IDS` and its `usableFavoriteIds` — the array is capped only
 * where it is *sent*, not where it is *held*. `data/favorites.ts` imports
 * this value rather than declaring its own, so the two cannot drift apart.
 */
export const MAX_GUEST_FAVORITES = 200;

/**
 * The favourited gesture ids, in the order they were favourited.
 *
 * Order is part of the contract rather than an accident, exactly as
 * `guestStore.ts` documents: a favorites screen renders in it.
 *
 * The value is treated as untrusted input even though this app wrote it.
 * `JSON.parse` is happy to hand back anything a corrupt or hand-edited store
 * holds, and `raw` itself is checked with `typeof ... === "string"` rather
 * than `!== null`: a broken or unmocked `AsyncStorage.getItem` can resolve
 * to `undefined` too, and treating only `null` as "nothing stored" would let
 * that shape reach `JSON.parse(undefined)`, which throws `"undefined" is
 * not valid JSON` outside the parse's own try/catch.
 */
export async function readGuestFavorites(): Promise<string[]> {
  let raw: unknown;

  try {
    raw = await AsyncStorage.getItem(GUEST_FAVORITES_KEY);
  } catch (error) {
    console.warn("[guest] Failed to read favorites:", error);
    return [];
  }

  if (typeof raw !== "string") {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn("[guest] Failed to parse stored favorites:", error);
    return [];
  }

  if (!Array.isArray(parsed)) {
    // `JSON.parse("null")` and `JSON.parse('{"a":1}')` both land here, and
    // both would throw on `.filter` a line later.
    console.warn("[guest] Stored favorites are not an array; ignoring.");
    return [];
  }

  /*
   * Deduplicated as well as filtered, for the same reason `guestStore.ts`
   * is: a duplicate id is not merely untidy, it is a duplicate React key on
   * whatever list renders it.
   */
  return [
    ...new Set(parsed.filter((id): id is string => typeof id === "string")),
  ];
}

/**
 * Writes the list, or gives up quietly.
 *
 * There is nothing useful a caller can do about a failed write, and
 * throwing would take the screen down with it — so the failure is logged
 * and swallowed, matching `guestStore.ts`'s `writeGuestFavorites`.
 */
async function writeGuestFavorites(ids: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(ids));
  } catch (error) {
    console.warn("[guest] Failed to store favorites:", error);
  }
}

/**
 * Adds or removes one gesture, and reports the list as it now stands.
 *
 * The returned value is the *intended* list, the same as `guestStore.ts`'s
 * own `toggleGuestFavorite`: whatever the reader asked for, even on a write
 * that failed silently, so the control they just pressed reflects the
 * press.
 *
 * **Never truncated.** However many ids are already stored, this adds one
 * more (or removes one) and keeps the rest — matching `guestStore.ts`
 * exactly, and the property Fix round 1 restored after an earlier version
 * of this function capped storage itself and silently dropped the oldest
 * id once a reader passed 200 favourites. See {@link MAX_GUEST_FAVORITES}'s
 * own comment for where that bound actually applies instead.
 */
export async function toggleGuestFavorite(id: string): Promise<string[]> {
  const current = await readGuestFavorites();
  const next = current.includes(id)
    ? current.filter((candidate) => candidate !== id)
    : [...current, id];

  await writeGuestFavorites(next);

  return next;
}

/**
 * Forgets the whole guest list, or gives up quietly.
 *
 * The one irreversible step in the sign-in merge, which is why it is a
 * function of its own rather than `toggleGuestFavorite` in a loop — see
 * `session.ts`'s `signIn`, which calls this only after the account has
 * acknowledged the merge and never before. There are no transactions on any
 * write path this app has, so clearing first and then failing loses the
 * favorites with nothing left to retry from.
 *
 * `removeItem` rather than writing `"[]"`: an absent key and an empty array
 * read the same through `readGuestFavorites`, and the absent one is the
 * state a device that never favourited anything is already in.
 */
export async function clearGuestFavorites(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GUEST_FAVORITES_KEY);
  } catch (error) {
    console.warn("[guest] Failed to clear favorites:", error);
  }
}
