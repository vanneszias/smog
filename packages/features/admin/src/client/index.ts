// biome-ignore-all lint/performance/noBarrelFile: the `@smog/admin/client` entry point (site only).
/**
 * `@smog/admin/client`: TanStack Query hooks over the typed `admin` slice.
 * One file per area; Tasks 2, 3, 5 and 6 add theirs and export them below,
 * one line each. Every write calls `useInvalidateAfterAdminWrite()` on
 * success. Never imports ./server.
 */

export {
  ADMIN_STALE_TIME,
  type AdminQueryUtils,
  useAdminKey,
  useAdminRpc,
  useInvalidateAfterAdminWrite,
} from "./slice";
export { useAdminAudit, useAdminAuditActors } from "./use-admin-audit";
export { useAdminDashboard } from "./use-admin-dashboard";
