import type { Access } from "payload";

/**
 * Restricts an operation to signed-in admins. Used for document- and
 * field-level access checks alike (the field-level check calls
 * `user?.role === "admin"` directly rather than through this function,
 * since `FieldAccess` has a different, boolean-only, signature).
 */
export const isAdmin: Access = ({ req: { user } }) => user?.role === "admin";

/** Allows any signed-in user, admin or not. */
export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user);

/**
 * Admins see everything. Everyone else — anonymous or signed-in — gets a
 * `Where` filter, never `true`, so the restriction is enforced by the query
 * itself across REST, GraphQL and the local API, not just in the admin UI.
 *
 * `isActive` is nullable in the generated schema (`integer DEFAULT true`,
 * no `NOT NULL`), so `equals: true` and `not_equals: false` disagree on NULL
 * rows. This uses `equals: true` deliberately: a NULL `isActive` (e.g. a row
 * Stage 9's Convex import forgot to set) is hidden rather than published by
 * default.
 */
export const publicReadActive: Access = ({ req: { user } }) => {
  if (user?.role === "admin") {
    return true;
  }

  return { isActive: { equals: true } };
};

/**
 * Admins reach every document. A signed-in non-admin is restricted to their
 * own document via a `Where` filter. Anonymous requests are denied outright.
 */
export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return { id: { equals: user.id } };
};
