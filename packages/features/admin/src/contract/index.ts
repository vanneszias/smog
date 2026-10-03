/**
 * `@smog/admin/contract`: the admin panel's procedures (spec §7). Mounted
 * as `admin` in `@smog/api`'s `appContract`. Every procedure needs the
 * admin role (`UNAUTHORIZED` for guests, `FORBIDDEN` for users, the role
 * read from D1 on each request), and every mutation writes an audit entry
 * (ruling 5).
 *
 * One slice file per area (every phase 5 area exists already), so the
 * tasks that fill them never edit this file. Phase 6 added `sponsorships`
 * and `export`: one import, one spread and one `ADMIN_SLICES` entry each.
 */

import { ADMIN_PROCEDURES as AUDIT_PROCEDURES, auditSlice } from "./audit";
import type { AdminProcedureKind } from "./audit-map";
import {
  ADMIN_PROCEDURES as CATEGORIES_PROCEDURES,
  categoriesSlice,
} from "./categories";
import {
  ADMIN_PROCEDURES as DASHBOARD_PROCEDURES,
  dashboardSlice,
} from "./dashboard";
import { ADMIN_PROCEDURES as EMAILS_PROCEDURES, emailsSlice } from "./emails";
import { ADMIN_PROCEDURES as EXPORT_PROCEDURES, exportSlice } from "./export";
import {
  ADMIN_PROCEDURES as GESTURES_PROCEDURES,
  gesturesSlice,
} from "./gestures";
import {
  ADMIN_PROCEDURES as MAINTENANCE_PROCEDURES,
  maintenanceSlice,
} from "./maintenance";
import { ADMIN_PROCEDURES as MUX_PROCEDURES, muxSlice } from "./mux";
import {
  ADMIN_PROCEDURES as SPONSORSHIPS_PROCEDURES,
  sponsorshipsSlice,
} from "./sponsorships";
import { ADMIN_PROCEDURES as USERS_PROCEDURES, usersSlice } from "./users";

export type {
  AdminProcedureKind,
  AdminProcedures,
  AuditExempt,
  AuditWrite,
  ProcedurePath,
} from "./audit-map";

export const adminContract = {
  ...dashboardSlice,
  ...auditSlice,
  ...gesturesSlice,
  ...categoriesSlice,
  ...muxSlice,
  ...usersSlice,
  ...maintenanceSlice,
  ...emailsSlice,
  ...sponsorshipsSlice,
  ...exportSlice,
};

export type AdminContract = typeof adminContract;

interface AdminSlice {
  contract: Record<string, unknown>;
  procedures: Readonly<Record<string, AdminProcedureKind>>;
}

/**
 * Every slice with its procedure kinds. Paths are relative to `admin`
 * (`"audit.list"`).
 */
export const ADMIN_SLICES = {
  audit: { contract: auditSlice, procedures: AUDIT_PROCEDURES },
  categories: { contract: categoriesSlice, procedures: CATEGORIES_PROCEDURES },
  dashboard: { contract: dashboardSlice, procedures: DASHBOARD_PROCEDURES },
  emails: { contract: emailsSlice, procedures: EMAILS_PROCEDURES },
  export: { contract: exportSlice, procedures: EXPORT_PROCEDURES },
  gestures: { contract: gesturesSlice, procedures: GESTURES_PROCEDURES },
  maintenance: {
    contract: maintenanceSlice,
    procedures: MAINTENANCE_PROCEDURES,
  },
  mux: { contract: muxSlice, procedures: MUX_PROCEDURES },
  sponsorships: {
    contract: sponsorshipsSlice,
    procedures: SPONSORSHIPS_PROCEDURES,
  },
  users: { contract: usersSlice, procedures: USERS_PROCEDURES },
} satisfies Record<string, AdminSlice>;

/** Every admin procedure's kind, by path; `adminProcedure` enforces it. */
export const ADMIN_PROCEDURE_KINDS: Readonly<
  Record<string, AdminProcedureKind>
> = Object.assign(
  {},
  ...Object.values(ADMIN_SLICES).map((slice) => slice.procedures)
);
