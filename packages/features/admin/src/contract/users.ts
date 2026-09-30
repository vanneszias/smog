import type { AdminAuditMap } from "./audit-map";

/**
 * `admin.users.*`: users, roles and bans (A-23, rulings 6 and 7). Task 5 fills this slice (and only this file,
 * `../server/users.ts` and its own tests), so the areas never share lines.
 */
export const usersSlice = {};

export const ADMIN_AUDIT_MAP = {
  mutations: {},
  reads: [],
} satisfies AdminAuditMap<typeof usersSlice>;
