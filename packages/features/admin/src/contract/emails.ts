import type { AdminAuditMap } from "./audit-map";

/**
 * `admin.emails.*`: the email previews (A-25, W-07). Task 6 fills this slice (and only this file,
 * `../server/emails.ts` and its own tests), so the areas never share lines.
 */
export const emailsSlice = {};

export const ADMIN_AUDIT_MAP = {
  mutations: {},
  reads: [],
} satisfies AdminAuditMap<typeof emailsSlice>;
