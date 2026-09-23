import type { Payload } from "payload";
import type { User } from "@/payload-types";
import { accountFavoriteIds } from "./accountFavorites";
import { usableFavoriteIds } from "./favoritesQuery";
import { clearGuestFavorites, readGuestFavorites } from "./guestStore";

/**
 * Guest favorites, carried into the account on the first signed-in page.
 *
 * ## Two halves in one module, on purpose
 *
 * {@link mergeGuestFavorites} runs on the server and writes the account.
 * {@link syncGuestFavorites} runs in the browser, because the guest list is
 * in `localStorage` and nowhere else, and it is the half that decides *when*
 * the local array is thrown away. They are kept together because the
 * ordering rule below spans both of them and a rule that lives in two files
 * is a rule nobody re-reads.
 *
 * **Nothing here imports Payload at runtime.** `Payload` is a type-only
 * import and erases, exactly as `PayloadRequest` does in `lib/formPost.ts`,
 * so a client component can import this module without dragging the
 * Payload/D1/drizzle graph into its chunk — the 519 KiB that
 * `lib/favoritesQuery.ts` measured. That is also why the server half is
 * handed a `payload` instance by its caller rather than reaching for
 * `getPayloadClient()`: a static edge into `payloadClient.ts` would put
 * `payload.config` in the client build's dependency graph even though every
 * import inside it is dynamic.
 *
 * ## The ordering rule
 *
 * There are no transactions on any write path in this app: the D1 adapter
 * takes `defaultBeginTransaction()`, which resolves to `null`, so
 * `initTransaction` never begins anything and `killTransaction` rolls
 * nothing back. A multi-step write here is therefore partially committed on
 * failure, and both of the two available defences are used:
 *
 * - **Idempotence.** Re-running the merge over the same ids is the *normal*
 *   case, not the exceptional one: a second sign-in in the same browser
 *   still has the same local array, and so does a reload between the write
 *   and the clear. The merge adds only what the account does not already
 *   hold, so running it twice leaves one of each.
 * - **The irreversible step last.** `clearGuestFavorites()` is the only step
 *   that cannot be undone or retried, so it happens after the server has
 *   acknowledged the write and never before. Clearing first and then failing
 *   loses the favorites with nothing left to retry from.
 *
 * ## Why the ids are resolved rather than trusted
 *
 * Payload's relationship validation is `isValidID`, and for a numeric key
 * that function is `typeof value === 'number'` and nothing else — no query,
 * no existence check (spec, "A relationship field accepts an id for a row
 * that does not exist"). A merge that wrote the guest's array straight into
 * `users.favorites` would therefore happily store ids for rows that were
 * deleted months ago, and `localStorage` is user-writable, so it can hold
 * anything at all. The lookup below runs as the signing-in account with
 * `overrideAccess: false`, which also means a gesture an editor has since
 * deactivated is dropped rather than carried in — the same rule the detail
 * page, the favorites list and `endpoints/favorites.ts` already run under.
 */

/** The only collection the merge writes. */
const USERS = "users";

/**
 * What a merge did.
 *
 * `added` is the ids that were not on the account before and are now;
 * `favorites` is the account's whole list afterwards, which is what the
 * browser needs in order to repaint a heart the server rendered before the
 * merge ran.
 *
 * Not exported, for the reason `accountFavorites.ts` gives about its own
 * result type: `knip` runs in CI and fails the build on an exported symbol
 * nothing imports, and both callers read this structurally.
 */
interface MergeResult {
  added: string[];
  favorites: string[];
}

/**
 * Adds a guest's favourite ids to an account, once each.
 *
 * Returns `null` when the account row is gone — a session that outlived the
 * user it names, which is what a delete in another tab looks like from here.
 * The caller answers "sign in again" rather than pretending the merge
 * happened.
 *
 * **The ids are screened three times and each screen is load-bearing.**
 * `usableFavoriteIds` drops anything that is not shaped like a primary key
 * and caps the list, because Payload maps an `in` on a number column through
 * `parseFloat`, so a non-numeric entry becomes `NaN` rather than being
 * rejected, and because D1 caps how many parameters one statement may bind.
 * The `payload.find` drops ids with no row behind them, because the
 * framework will not. The `current.includes` filter drops what the account
 * already holds, which is what makes a second run a no-op.
 */
export async function mergeGuestFavorites({
  ids,
  payload,
  user,
}: {
  ids: readonly string[];
  payload: Payload;
  user: User;
}): Promise<MergeResult | null> {
  const account = (await payload.findByID({
    collection: USERS,
    depth: 0,
    disableErrors: true,
    id: user.id,
    overrideAccess: false,
    user,
  })) as null | User;

  if (account === null) {
    return null;
  }

  const current = accountFavoriteIds(account);
  const wanted = usableFavoriteIds(ids);

  if (wanted.length === 0) {
    return { added: [], favorites: current };
  }

  /*
   * **An explicit `limit`, because Payload's default page size is ten** — a
   * guest with eleven favorites would otherwise have the last one reported
   * as "no longer exists" and silently dropped. `wanted` is already capped
   * by `usableFavoriteIds`, so this cannot grow without bound.
   *
   * `pagination: false` would have the same effect and is deliberately *not*
   * used with it. A mutation sweep proved why: with both, removing the
   * `limit` failed nothing, because `pagination: false` makes Payload ignore
   * the page size entirely — so the line that looked like the bound was
   * decorative and the test that looked like it proved the bound proved the
   * other option. One of them, provable, beats two that alibi each other.
   */
  const found = await payload.find({
    collection: "gestures",
    depth: 0,
    limit: wanted.length,
    overrideAccess: false,
    select: {},
    user,
    where: { id: { in: wanted } },
  });

  const real = new Set(found.docs.map((doc) => String(doc.id)));
  const added = wanted.filter((id) => real.has(id) && !current.includes(id));

  if (added.length === 0) {
    /*
     * Nothing to write, so nothing is written. The re-run is the ordinary
     * case here, and an update that stores the array it just read is still a
     * row rewrite, a `updatedAt` bump and a hook pass for no change at all.
     */
    return { added, favorites: current };
  }

  const favorites = [...current, ...added];

  /*
   * **Numbers, not strings.** `isValidID` requires `typeof value ===
   * 'number'` for a numeric key, so `favorites: ["7"]` fails validation with
   * "invalid relationships" while `favorites: [7]` succeeds — and every
   * other layer of this feature carries ids as strings. Same conversion, and
   * the same reason, as `endpoints/favorites.ts`.
   */
  await payload.update({
    collection: USERS,
    data: { favorites: favorites.map(Number) },
    depth: 0,
    id: user.id,
    overrideAccess: false,
    user,
  });

  return { added, favorites };
}

/**
 * Where the browser posts the guest list. A `next.config.ts` rewrite onto
 * the Payload endpoint in `endpoints/favorites.ts`, for the bundle reason
 * that file spells out.
 */
const MERGE_PATH = "/account/merge-favorites";

/** What the browser's half of the merge can turn out to be. */
type GuestMerge =
  | { status: "failed" }
  | { favorites: string[]; status: "merged" }
  | { status: "nothing-to-merge" };

/** The response body, narrowed, or `null` if it is not one. */
function readMerged(body: unknown): null | string[] {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { favorites } = body as { favorites?: unknown };

  if (!Array.isArray(favorites)) {
    return null;
  }

  return favorites.filter((id): id is string => typeof id === "string");
}

/**
 * Hands this browser's guest favorites to the signed-in account, and clears
 * them once — and only once — the account has them.
 *
 * Never throws and never reports a merge it did not get an answer for. The
 * caller is a mount effect in a client component, and an effect that throws
 * is an unhandled error in the React tree: the page below the nearest
 * boundary goes blank, which is a far worse outcome than an unmerged list
 * that will be offered again on the next page.
 *
 * A failure leaves the local array exactly where it was, so the next
 * signed-in page retries it. That is safe precisely because the server half
 * is idempotent.
 */
export async function syncGuestFavorites(): Promise<GuestMerge> {
  /*
   * **Two components call this, and it deliberately does not de-duplicate
   * them.** The layout's `GuestFavoritesSync` runs on every signed-in page
   * and `FavoriteButton` runs on gesture pages, so on a gesture page both
   * mount in the same tick, both read the same non-empty array before either
   * has cleared it, and both post it.
   *
   * An in-flight guard collapsing them into one request was written, proved
   * to work, and then **reverted**: handing both callers the same promise
   * fixes the handler order, so the abandoned caller's `.then` always
   * settles before the live one's. That made `FavoriteButton`'s `live`
   * cleanup flag unprovable — the mutation that deletes it stopped failing
   * anything, because the live answer now always landed last and overwrote
   * the stale one. A saved request is not worth an unguarded stale write;
   * a duplicate POST of the same ids is exactly the case the server half's
   * idempotency exists for, and that idempotency is itself mutation-proven.
   */
  const ids = readGuestFavorites();

  if (ids.length === 0) {
    // No request at all for the overwhelmingly common case: a reader who
    // never favourited anything as a guest, on every page they open.
    return { status: "nothing-to-merge" };
  }

  let favorites: null | string[];

  try {
    const response = await fetch(MERGE_PATH, {
      body: JSON.stringify({ ids }),
      // The answer is this reader's own list. Nothing in between should keep
      // a copy; the endpoint says `no-store` too.
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      return { status: "failed" };
    }

    favorites = readMerged(await response.json());
  } catch (error) {
    // A dropped connection, an aborted navigation, a body that is not JSON.
    console.error("[mergeGuestState] Failed to merge guest favorites:", error);
    return { status: "failed" };
  }

  if (favorites === null) {
    // An answer we cannot read is not an acknowledgement. Keeping the local
    // array is the whole point: it can be offered again.
    return { status: "failed" };
  }

  // **Last, and only here.** See the ordering rule at the top of the file.
  clearGuestFavorites();

  return { favorites, status: "merged" };
}
