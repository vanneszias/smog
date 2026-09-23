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
 * an import forgot to set) is hidden rather than published by default.
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
 * The `req.context` key `endpoints/auth.ts` sets when it is the one creating
 * a user.
 *
 * A string rather than a symbol because `RequestContext` is serialisable and
 * Payload copies it through `createLocalReq`.
 */
export const SELF_REGISTRATION = "smog:selfRegistration";

/**
 * Admins, plus the site's own sign-up endpoint. Nothing else may create a
 * user.
 *
 * ## Why `create` is no longer `() => true`
 *
 * It was, deliberately, so that people could register. What forces the change
 * is not tidiness: a public `create` makes `POST /api/users` the most direct
 * email-enumeration oracle on the site. One unauthenticated request separates a
 * registered address (400, "A user with the given email is already registered")
 * from a free one (201), reproduced against a running dev server. No amount of
 * care in `/auth/sign-up` closes that while Payload's REST API is mounted and
 * its `create` is public.
 *
 * ## Why `req.context` is a real guard and not a password in a cookie
 *
 * `createPayloadRequest` sets `context: {}` **unconditionally** for every
 * REST and GraphQL request (`payload/dist/utilities/createPayloadRequest.js`,
 * verified at the call site — it is a literal, not a default that a body
 * could override). The only way a request carries context is
 * `createLocalReq`, which is the Local API, which is server-side code. So
 * this is "the call came from inside this application", which is exactly
 * what it needs to express.
 *
 * ## Why not simply create with `overrideAccess: true`
 *
 * Because that would throw away the *field*-level guard at the same time.
 * `role` carries `create: isAdminField`, and `overrideAccess: true` skips field
 * access entirely — so the sign-up endpoint would be relying on its literal
 * `role: "user"` alone. A mutation sweep showed that each of those two guards
 * alone is invisible and only the pair is provable; this keeps both, by letting
 * the endpoint through `access.create` rather than around it.
 */
export const isAdminOrSelfRegistration: Access = ({ req }) =>
  req.user?.role === "admin" || req.context?.[SELF_REGISTRATION] === true;

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
 * `() => true`: every access rule is a named, tested function, and "this one is
 * deliberately public" is exactly the decision worth making legible.
 */
export const publicRead: Access = () => true;

/**
 * Denies every request, signed in or not, admin or not.
 *
 * The counterpart to `publicRead`: collections never carry an inline
 * `() => false` either, and "nothing reachable over the API may write this"
 * is a decision worth naming. Used for `create`, `update` and `delete` on
 * the audit collections (`admin-logs`, `user-consents`), whose only writer
 * is a server-side hook going through the local API — where `overrideAccess`
 * defaults to `true` and so bypasses this entirely
 * (`payload/dist/collections/operations/local/create.js`, 3.89.0).
 *
 * Denying admins too is the point, not an oversight: a log an admin can POST
 * to records whatever that admin wants it to record.
 */
export const denyAll: Access = () => false;
