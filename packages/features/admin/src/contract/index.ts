/**
 * `@smog/admin/contract`: the admin panel's procedures (spec §7). Mounted
 * as `admin` in `@smog/api`'s `appContract`. Every procedure needs the
 * admin role (`UNAUTHORIZED` for guests, `FORBIDDEN` for users, the role
 * read from D1 on each request), and every mutation writes an audit entry
 * (ruling 5).
 *
 * One slice file per area (every phase 5 area exists already), so the
 * tasks that fill them never edit this file. Phase 6 adds `sponsorships`
 * and `export` here: one import, one spread and one `ADMIN_SLICES` entry.
 */

import { ADMIN_AUDIT_MAP as AUDIT_AUDIT_MAP, auditSlice } from "./audit";
import type { AuditExempt } from "./audit-map";
import {
  ADMIN_AUDIT_MAP as CATEGORIES_AUDIT_MAP,
  categoriesSlice,
} from "./categories";
import {
  ADMIN_AUDIT_MAP as DASHBOARD_AUDIT_MAP,
  dashboardSlice,
} from "./dashboard";
import { ADMIN_AUDIT_MAP as EMAILS_AUDIT_MAP, emailsSlice } from "./emails";
import {
  ADMIN_AUDIT_MAP as GESTURES_AUDIT_MAP,
  gesturesSlice,
} from "./gestures";
import {
  ADMIN_AUDIT_MAP as MAINTENANCE_AUDIT_MAP,
  maintenanceSlice,
} from "./maintenance";
import { ADMIN_AUDIT_MAP as MUX_AUDIT_MAP, muxSlice } from "./mux";
import { ADMIN_AUDIT_MAP as USERS_AUDIT_MAP, usersSlice } from "./users";

export type { AdminAuditMap, AuditExempt, ProcedurePath } from "./audit-map";

export const adminContract = {
  ...dashboardSlice,
  ...auditSlice,
  ...gesturesSlice,
  ...categoriesSlice,
  ...muxSlice,
  ...usersSlice,
  ...maintenanceSlice,
  ...emailsSlice,
};

export type AdminContract = typeof adminContract;

interface AdminSlice {
  auditMap: {
    mutations: Record<string, string | AuditExempt>;
    reads: readonly string[];
  };
  contract: Record<string, unknown>;
}

/**
 * Every slice with its audit map; the coverage test walks these. Paths in
 * a map are relative to `admin` (`"audit.list"`).
 */
export const ADMIN_SLICES = {
  audit: { auditMap: AUDIT_AUDIT_MAP, contract: auditSlice },
  categories: { auditMap: CATEGORIES_AUDIT_MAP, contract: categoriesSlice },
  dashboard: { auditMap: DASHBOARD_AUDIT_MAP, contract: dashboardSlice },
  emails: { auditMap: EMAILS_AUDIT_MAP, contract: emailsSlice },
  gestures: { auditMap: GESTURES_AUDIT_MAP, contract: gesturesSlice },
  maintenance: {
    auditMap: MAINTENANCE_AUDIT_MAP,
    contract: maintenanceSlice,
  },
  mux: { auditMap: MUX_AUDIT_MAP, contract: muxSlice },
  users: { auditMap: USERS_AUDIT_MAP, contract: usersSlice },
} satisfies Record<string, AdminSlice>;
