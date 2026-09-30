import type { AdminProcedures } from "./audit-map";

/**
 * `admin.mux.*`: Mux direct uploads and the asset picker (ruling 4). Task 3 fills this slice (and only this file,
 * `../server/mux.ts` and its own tests), so the areas never share lines.
 */
export const muxSlice = {};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {} as const satisfies AdminProcedures<
  typeof muxSlice
>;
