// biome-ignore-all lint/performance/noBarrelFile: the `@smog/admin/schema` entry point (client-safe).
/**
 * `@smog/admin/schema`: the Zod schemas of the admin procedures, shared by
 * the contract, the server and the hooks. One file per area; Tasks 2, 5
 * and 6 add theirs (`catalog.ts`, `users.ts`, `maintenance.ts`) and export
 * them below, one line each.
 */
export {
  AUDIT_ACTIONS,
  AUDIT_ACTORS_MAX,
  AUDIT_DATA_SCHEMAS,
  AUDIT_PAGE_DEFAULT,
  AUDIT_PAGE_MAX,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditActor,
  type AuditData,
  type AuditEntry,
  type AuditListInput,
  type AuditListQuery,
  type AuditPage,
  type AuditTargetType,
  auditActionSchema,
  auditActorsSchema,
  auditDataSchema,
  auditEntrySchema,
  auditListInputSchema,
  auditPageSchema,
  auditTargetTypeSchema,
  type WritableAuditAction,
} from "./audit";
export {
  DASHBOARD_NEW_USER_DAYS,
  DASHBOARD_RECENT_AUDIT,
  type Dashboard,
  dashboardSchema,
} from "./dashboard";
