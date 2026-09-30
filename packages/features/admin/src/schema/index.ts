// biome-ignore-all lint/performance/noBarrelFile: the `@smog/admin/schema` entry point (client-safe).
/**
 * `@smog/admin/schema`: the Zod schemas of the admin procedures, shared by
 * the contract, the server and the hooks. One file per area; each area's
 * file is re-exported whole below, so a task edits only its own file.
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
  isWritableAuditAction,
  READ_ONLY_AUDIT_ACTIONS,
  type WritableAuditAction,
} from "./audit";
// The area files (Tasks 2, 5 and 6 fill them).
export * from "./catalog";
export {
  DASHBOARD_NEW_USER_DAYS,
  DASHBOARD_RECENT_AUDIT,
  type Dashboard,
  dashboardSchema,
} from "./dashboard";
export * from "./maintenance";
export * from "./users";
