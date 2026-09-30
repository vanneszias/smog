import type { AdminAuditMap } from "./audit-map";

/**
 * `admin.mux.*`: Mux direct uploads and the asset picker (ruling 4). Task 3 fills this slice (and only this file,
 * `../server/mux.ts` and its own tests), so the areas never share lines.
 */
export const muxSlice = {};

export const ADMIN_AUDIT_MAP = {
  mutations: {},
  reads: [],
} satisfies AdminAuditMap<typeof muxSlice>;
