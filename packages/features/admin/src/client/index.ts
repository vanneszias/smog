// biome-ignore-all lint/performance/noBarrelFile: the `@smog/admin/client` entry point (site only).
/**
 * `@smog/admin/client`: TanStack Query hooks over the typed `admin` slice.
 * One file per area, each re-exported whole below, so a task edits only
 * its own file. Every write calls `useInvalidateAfterAdminWrite()` on
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
// The area files (Tasks 2, 3, 5 and 6 fill them).
export * from "./use-admin-categories";
export { useAdminDashboard } from "./use-admin-dashboard";
export * from "./use-admin-gestures";
export * from "./use-admin-users";
export * from "./use-email-preview";
export * from "./use-maintenance";
export * from "./use-mux-assets";
export * from "./use-mux-upload";
