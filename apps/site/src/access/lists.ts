import type { Access, AccessResult, FieldAccess, Where } from "payload";

/**
 * Extracts the `shareToken` query parameter, treating an absent or
 * empty/whitespace-only value as "no token". This is the key piece: a
 * naive `req.searchParams?.get("shareToken")` compared with
 * `{ equals: token }` when `token` is `undefined` or `""` would build
 * `{ viewShareToken: { equals: undefined } }` (which the query layer would
 * happily match against every list whose `viewShareToken` column is NULL —
 * i.e. every private list in the database) or a `{ equals: "" }` filter that
 * matches only if some list's token is genuinely the empty string. Neither
 * is "deny everything", so both are normalized to `null` here and the
 * callers below return `false` for `null`.
 */
function shareToken(req: { searchParams?: URLSearchParams }): string | null {
  const token = req.searchParams?.get("shareToken");
  return token && token.trim() !== "" ? token : null;
}

/**
 * Admins see every list. Everyone else sees the lists they own, plus the one
 * their `shareToken` query parameter names — and an anonymous request with no
 * usable token is denied outright rather than being handed
 * `{ viewShareToken: { equals: undefined } }`, which would match every list
 * whose `viewShareToken` column is NULL.
 *
 * **Why the signed-in branch widens rather than replaces.** It used to return
 * `{ owner: { equals: req.user.id } }` unconditionally, which meant an
 * authenticated recipient of a share link saw nothing — anonymous-only
 * sharing, which is not the product intent (spec, "Sharing is inert until
 * Stage 3", gap 2). A token now *adds* to what its holder can reach, in both
 * directions: they keep their own lists, and they gain the shared one.
 *
 * **Why the tokenless guard survives Task 7.** Minting means most rows now
 * carry a token, so the reasoning "the columns are no longer NULL, the guard
 * is dead code" is available and is wrong twice over. Rows created before
 * minting still hold NULL, and `viewShareToken` has no `required: true` to
 * stop a future write clearing one. `shareTokens.int.test.ts` keeps exactly
 * such a row on hand so the guard is provably load-bearing rather than
 * merely defensible.
 */
export const listReadAccess: Access = ({ req }): AccessResult => {
  if (req.user?.role === "admin") {
    return true;
  }

  const token = shareToken(req);

  if (req.user) {
    const own = { owner: { equals: req.user.id } };

    return token ? { or: [own, { viewShareToken: { equals: token } }] } : own;
  }

  if (!token) {
    return false;
  }

  return { viewShareToken: { equals: token } };
};

/**
 * Same shape as `listReadAccess`, but an editor must present the edit token,
 * not the view token, and `allowSharedEditing` must be on — otherwise a list
 * owner who shared a read-only view link would unknowingly be granting write
 * access with it.
 *
 * The signed-in branch widens for the same reason read's does, and the clause
 * it widens with is the *whole* anonymous rule rather than a bare token
 * match. An edit link that stopped honouring `allowSharedEditing` the moment
 * its holder signed in would be a way around the owner's revocation switch,
 * and "signed in" is not a property the owner granted anything to.
 */
export const listUpdateAccess: Access = ({ req }): AccessResult => {
  if (req.user?.role === "admin") {
    return true;
  }

  const token = shareToken(req);

  /*
   * A function of a *non-null* token rather than a value computed up front.
   * Building it eagerly would put `{ editShareToken: { equals: null } }` on
   * the stack for every tokenless request, one careless reorder away from
   * being returned — and that filter matches every list whose edit token is
   * NULL, which is the identical trap `shareToken()` exists to close.
   */
  const byEditToken = (value: string): Where => ({
    and: [
      { editShareToken: { equals: value } },
      { allowSharedEditing: { equals: true } },
    ],
  });

  if (req.user) {
    const own = { owner: { equals: req.user.id } };

    return token ? { or: [own, byEditToken(token)] } : own;
  }

  if (!token) {
    return false;
  }

  return byEditToken(token);
};

/**
 * Admins can delete every list. A signed-in non-admin may delete only lists
 * they own, via a `Where` filter — this is `isAdminOrSelf`'s shape, but
 * keyed on the document's `owner` field rather than the requesting user's
 * own `id`, since `lists` isn't the `users` collection.
 *
 * Deliberately narrower than `listUpdateAccess`: deleting a list is a
 * strictly bigger, non-undoable authority than editing its items, so unlike
 * update there is no share-token path here at all. An anonymous request —
 * edit link or not — is denied outright, regardless of what token it
 * presents.
 *
 * Task 7 widened the signed-in branch of read and update so a token adds to
 * what its holder can reach. This one deliberately did **not** follow, and
 * the likeliest way for it to start is somebody applying the same edit to all
 * three. `lists.test.ts` asserts the exact shape here for that reason.
 */
export const listDeleteAccess: Access = ({ req }): AccessResult => {
  if (req.user?.role === "admin") {
    return true;
  }

  if (req.user) {
    return { owner: { equals: req.user.id } };
  }

  return false;
};

/**
 * Field-level guard for `viewShareToken`, `editShareToken` and
 * `allowSharedEditing`: only the list's owner or an admin may change them,
 * even though `listUpdateAccess` already lets an anonymous edit-link holder
 * update the document as a whole (to add/reorder items). Without this, that
 * same anonymous editor could PATCH new values onto the very fields that
 * grant edit access — rotating both tokens and locking the owner out of
 * their own list.
 *
 * `FieldAccess` is boolean-only (see `isAdminField` above), and Payload
 * 3.89.0 calls it with `{ id, blockData, data, doc, req, siblingData }`
 * (`apps/site/node_modules/payload/dist/fields/hooks/beforeValidate/promise.js`).
 * `doc` is the document's state *before* this update is applied — verified
 * against a real database in `lists.int.test.ts` — with `owner` still a raw
 * ID rather than a populated user, since Payload only resolves
 * relationships to full documents in `afterRead` hooks, not here. `doc` is
 * `undefined` during `create`, but this guard is only registered on
 * `access.update`, so that case never reaches it.
 */
export const isListOwnerField: FieldAccess = ({ req, doc }) => {
  if (req.user?.role === "admin") {
    return true;
  }

  if (!(req.user && doc)) {
    return false;
  }

  const ownerId =
    typeof doc.owner === "object" && doc.owner !== null
      ? (doc.owner as { id: unknown }).id
      : doc.owner;

  return ownerId === req.user.id;
};
