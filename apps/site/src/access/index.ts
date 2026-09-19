import type { Access, FieldAccess } from "payload";

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

/**
 * Field-level equivalent of `isAdmin`.
 *
 * `FieldAccess` returns a plain boolean — it has no `Where` form — so this
 * cannot reuse `isAdmin`, whose `Access` signature may also return a filter.
 * Kept here rather than inline in a collection so every privileged field
 * enforces the same rule.
 */
export const isAdminField: FieldAccess = ({ req: { user } }) =>
  user?.role === "admin";

/**
 * Unconditionally public read. Exists so collections never carry an inline
 * `() => true`: the plan requires every access rule to be a named, tested
 * function, and "this one is deliberately public" is exactly the decision
 * worth making legible.
 */
export const publicRead: Access = () => true;
