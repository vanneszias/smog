import type { CollectionBeforeDeleteHook } from "payload";
import { APIError } from "payload";

/** HTTP 400 — anything but 500 makes `APIError` public, but see below for
 * why `isPublic` is passed explicitly anyway. */
const BAD_REQUEST = 400;

/**
 * Deletes a user's lists when the user is deleted.
 *
 * The spec's "Referential integrity" table rules cascade for `lists.owner`:
 * a private list has no meaning without its owner, and an ownerless row
 * would strand where no access filter can reach it — `listReadAccess`
 * matches on `owner` or a share token, so a list whose owner column went
 * NULL would be invisible to everyone including admins' own filters and
 * undeletable through the UI.
 *
 * Cascade is also the only option the database leaves. Payload emits
 * `lists.owner_id` as `NOT NULL` with `ON DELETE set null`, which SQLite
 * cannot satisfy, so before this hook deleting any user who had ever made a
 * list failed with a raw `Failed query: delete from "users" where ...`. The
 * alternative fix — making `owner` optional so `set null` becomes legal —
 * produces exactly the stranded rows the spec rejects.
 *
 * **Why a hook and not only the foreign key.** The companion migration does
 * change the constraint to `ON DELETE cascade`, but a database-level cascade
 * removes rows without Payload noticing: no `beforeDelete`/`afterDelete` on
 * `lists`, no hook a later stage might add for cleanup. Going through
 * `payload.delete` keeps the deletion inside Payload's own lifecycle, and
 * leaves the foreign key as the backstop for any path that bypasses the
 * Local API. The two agree, so whichever fires first the outcome is the same.
 *
 * **Why the errors are re-thrown.** The bulk delete operation does not
 * rethrow: it collects `{ id, message }` per document and resolves
 * (`collections/operations/delete.js`, 3.89.0). Swallowing that would leave
 * the list in place and let the `users` delete proceed straight into the
 * foreign-key error this hook exists to prevent — the original bug, with an
 * extra step. Re-throwing aborts the delete instead, with a message naming
 * what is stuck.
 *
 * **What re-throwing does not buy is a rollback.** It is natural to assume
 * `deleteByID`'s `initTransaction` / `killTransaction` wrapper makes this
 * all-or-nothing. It does not here: `sqliteD1Adapter` is constructed without
 * `transactionOptions` (`payload.config.ts`), so the adapter takes Payload's
 * `defaultBeginTransaction()`, which resolves to `null`, `initTransaction`
 * returns false and no transaction is ever opened. Any list deleted before
 * the failing one stays deleted.
 *
 * That is the argument for doing this in `beforeDelete` rather than
 * `afterDelete`, and it is worth stating because without a transaction the
 * two are not equivalent. The worst case here is a user who still has their
 * account and has lost some lists — recoverable, and visible to them. The
 * worst case the other way round is a deleted user whose lists survive with
 * a dangling `owner_id`, which no access filter matches and nothing in the
 * admin panel can reach: precisely the stranded rows the spec rules out.
 */
export const cascadeListsOnUserDelete: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  const { errors } = await req.payload.delete({
    collection: "lists",
    depth: 0,
    overrideAccess: true,
    // The caller's `req`, so these deletes carry the same user, locale and
    // session as the delete that triggered them — and so that they would be
    // enlisted in the caller's transaction if this project ever configured
    // one. Today it does not; see above.
    req,
    where: { owner: { equals: id } },
  });

  if (errors.length === 0) {
    return;
  }

  const detail = errors
    .map((error) => `#${error.id}: ${error.message}`)
    .join("; ");

  throw new APIError(
    `Cannot delete this user: ${errors.length} of their lists could not be removed (${detail}).`,
    BAD_REQUEST,
    undefined,
    true
  );
};
