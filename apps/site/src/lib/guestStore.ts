/**
 * Guest favorites, kept in the browser.
 *
 * `users.favorites` exists from Stage 1 Task 4, but nothing can write it
 * without auth and auth is Stage 4. The product decision of 2026-09-19 is
 * that a guest keeps this state locally and is prompted to sign in when they
 * want it synced — so there is deliberately **no guest identity** here: no
 * generated id, no anonymous account, no server-side session. A row of ids in
 * `localStorage` and nothing else.
 *
 * **Every function in this module degrades to "no favorites" and none of them
 * throws.** That is Review Focus item 3 and it is the whole point of the
 * module. The reasons are not hypothetical:
 *
 * - `localStorage` is a *getter* on `window`, and in private browsing or with
 *   site data blocked it throws `SecurityError` when read. It does not return
 *   `null`, so `localStorage == null` is not a check — only a try/catch is.
 * - the stored value can be absent, not JSON at all, JSON that is not an
 *   array, or an array holding things that are not ids.
 * - `setItem` throws `QuotaExceededError`, and in Safari's private mode it
 *   does so with a quota of zero, i.e. on the very first write.
 *
 * A page that throws while rendering favorites is a blank page. Every path
 * below is written so the worst outcome is an empty list.
 */

/**
 * Namespaced, because `localStorage` is keyed by origin and the admin panel,
 * the public site and anything else ever served from this Worker share one.
 * A bare `"favorites"` is the kind of key two unrelated features pick
 * independently.
 */
export const GUEST_FAVORITES_KEY = "smog.guest.favorites";

/**
 * The store, or `null` when there is not one we are allowed to touch.
 *
 * Three distinct cases collapse into that `null`, and all three are normal:
 * server-side rendering (no `window` at all), private browsing, and a reader
 * who has blocked site data. None of them is an error worth `console.error`,
 * which is why the callers below log at `warn` — a render that ran on the
 * server would otherwise emit an error line on every request.
 *
 * `typeof window === "undefined"` is checked first and separately: on the
 * server the identifier is not declared at all, and reading it would throw a
 * `ReferenceError` rather than the `SecurityError` this is guarding.
 */
function openStore(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn("[guestStore] Failed to open localStorage:", error);
    return null;
  }
}

/**
 * The favourited gesture ids, in the order they were favourited.
 *
 * Order is part of the contract rather than an accident: the favorites page
 * renders the grid in it.
 *
 * The value is treated as untrusted input even though this app wrote it —
 * an older build, another tab, a hand-edited store and a half-finished write
 * all produce shapes that are not `string[]`, and `JSON.parse` is happy to
 * hand back any of them.
 */
export function readGuestFavorites(): string[] {
  const store = openStore();

  if (store === null) {
    return [];
  }

  let raw: string | null;

  try {
    raw = store.getItem(GUEST_FAVORITES_KEY);
  } catch (error) {
    // Reachable even though `openStore` succeeded: Firefox's
    // `dom.storage.enabled=false` hands out the object and refuses the call.
    console.warn("[guestStore] Failed to read favorites:", error);
    return [];
  }

  if (raw === null) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn("[guestStore] Failed to parse stored favorites:", error);
    return [];
  }

  if (!Array.isArray(parsed)) {
    // `JSON.parse("null")` and `JSON.parse('{"a":1}')` both land here, and
    // both would throw on `.filter` a line later.
    console.warn("[guestStore] Stored favorites are not an array; ignoring.");
    return [];
  }

  /*
   * Deduplicated as well as filtered. A duplicate id is not merely untidy:
   * the favorites grid keys its cards on it, and two children with the same
   * React key is a rendering bug.
   */
  return [
    ...new Set(parsed.filter((id): id is string => typeof id === "string")),
  ];
}

/**
 * Writes the list, or gives up quietly.
 *
 * There is nothing useful a caller can do about a failed write — the reader
 * is in private browsing, or out of quota — and throwing would take down the
 * page they are reading. So the failure is logged and swallowed, and the
 * caller is told what the list *should* be.
 */
function writeGuestFavorites(ids: readonly string[]): void {
  const store = openStore();

  if (store === null) {
    return;
  }

  try {
    store.setItem(GUEST_FAVORITES_KEY, JSON.stringify(ids));
  } catch (error) {
    console.warn("[guestStore] Failed to store favorites:", error);
  }
}

/**
 * Adds or removes one gesture, and reports the list as it now stands.
 *
 * The returned value is the *intended* list, which is the same as the stored
 * one whenever the store works. When the write fails it deliberately still
 * describes what the reader asked for, so the button they just pressed
 * reflects the press; the loss becomes visible on the next reload, which is
 * the honest place for it. Returning the old list instead would make the
 * control look broken rather than unsynced.
 *
 * A corrupt store is repaired rather than compounded: `readGuestFavorites`
 * has already reduced it to `[]`, so the write that follows replaces the
 * unparseable value with a valid one.
 */
export function toggleGuestFavorite(id: string): string[] {
  const current = readGuestFavorites();
  const next = current.includes(id)
    ? current.filter((candidate) => candidate !== id)
    : [...current, id];

  writeGuestFavorites(next);

  return next;
}
