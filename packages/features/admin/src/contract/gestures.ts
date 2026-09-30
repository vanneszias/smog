import type { AdminProcedures } from "./audit-map";

/**
 * `admin.gestures.*`: the gesture list, editor, table editor, publish and bulk update (A-16–A-21). Task 2 fills this slice (and only this file,
 * `../server/gestures.ts` and its own tests), so the areas never share lines.
 */
export const gesturesSlice = {};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {} as const satisfies AdminProcedures<
  typeof gesturesSlice
>;
