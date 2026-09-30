import type { AdminProcedures } from "./audit-map";

/**
 * `admin.categories.*`: the category list, create, rename, publish, reorder and delete (A-22). Task 2 fills this slice (and only this file,
 * `../server/categories.ts` and its own tests), so the areas never share lines.
 */
export const categoriesSlice = {};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {} as const satisfies AdminProcedures<
  typeof categoriesSlice
>;
