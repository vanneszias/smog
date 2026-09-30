import type { AdminAuditMap } from "./audit-map";

/**
 * `admin.maintenance.*`: the maintenance setting (A-26, ruling 9). Task 6 fills this slice (and only this file,
 * `../server/maintenance.ts` and its own tests), so the areas never share lines.
 */
export const maintenanceSlice = {};

export const ADMIN_AUDIT_MAP = {
  mutations: {},
  reads: [],
} satisfies AdminAuditMap<typeof maintenanceSlice>;
