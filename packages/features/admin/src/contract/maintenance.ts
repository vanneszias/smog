import type { AdminProcedures } from "./audit-map";

/**
 * `admin.maintenance.*`: the maintenance setting (A-26, ruling 9). Task 6 fills this slice (and only this file,
 * `../server/maintenance.ts` and its own tests), so the areas never share lines.
 */
export const maintenanceSlice = {};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {} as const satisfies AdminProcedures<
  typeof maintenanceSlice
>;
