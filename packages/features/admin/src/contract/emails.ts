import type { AdminProcedures } from "./audit-map";

/**
 * `admin.emails.*`: the email previews (A-25, W-07). Task 6 fills this slice (and only this file,
 * `../server/emails.ts` and its own tests), so the areas never share lines.
 */
export const emailsSlice = {};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {} as const satisfies AdminProcedures<
  typeof emailsSlice
>;
