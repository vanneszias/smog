import type { Access, AccessResult } from "payload";

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
