import type { AdminProcedures } from "./audit-map";

/**
 * `admin.users.*`: users, roles and bans (A-23, rulings 6 and 7). Task 5 fills this slice (and only this file,
 * `../server/users.ts` and its own tests), so the areas never share lines.
 */
export const usersSlice = {};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {} as const satisfies AdminProcedures<
  typeof usersSlice
>;
