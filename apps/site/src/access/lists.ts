import type { Access, AccessResult, FieldAccess } from "payload";

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
 * Admins see every list. A signed-in non-admin is restricted to lists they
 * own via a `Where` filter. An anonymous request is restricted to the list
 * matching its `shareToken` query parameter, if any — and denied outright
 * when no usable token is supplied, rather than being handed
 * `{ viewShareToken: { equals: undefined } }`, which would match every
 * private list whose `viewShareToken` column is NULL.
 */
export const listReadAccess: Access = ({ req }): AccessResult => {
  if (req.user?.role === "admin") {
    return true;
  }

  if (req.user) {
    return { owner: { equals: req.user.id } };
  }

  const token = shareToken(req);

  if (!token) {
    return false;
  }

  return { viewShareToken: { equals: token } };
};

/**
 * Same shape as `listReadAccess`, but an anonymous editor must present the
 * edit token, not the view token, and `allowSharedEditing` must be on —
 * otherwise a list owner who shared a read-only view link would
 * unknowingly be granting write access with it.
 */
export const listUpdateAccess: Access = ({ req }): AccessResult => {
  if (req.user?.role === "admin") {
    return true;
  }

  if (req.user) {
    return { owner: { equals: req.user.id } };
  }

  const token = shareToken(req);

  if (!token) {
    return false;
  }

  return {
    and: [
      { editShareToken: { equals: token } },
      { allowSharedEditing: { equals: true } },
    ],
  };
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
