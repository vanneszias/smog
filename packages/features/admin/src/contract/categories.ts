import type { AdminAuditMap } from "./audit-map";

/**
 * `admin.categories.*`: the category list, create, rename, publish, reorder and delete (A-22). Task 2 fills this slice (and only this file,
 * `../server/categories.ts` and its own tests), so the areas never share lines.
 */
export const categoriesSlice = {};

export const ADMIN_AUDIT_MAP = {
  mutations: {},
  reads: [],
} satisfies AdminAuditMap<typeof categoriesSlice>;
