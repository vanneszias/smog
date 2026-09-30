import { baseContract } from "@smog/rpc/contract";
import { dashboardSchema } from "../schema";
import type { AdminAuditMap } from "./audit-map";

/** `admin.dashboard` (A-03). */
export const dashboardSlice = {
  /**
   * The catalogue and user counts, and the newest audit entries. One D1
   * batch. Phase 6 adds the sponsorship stats.
   */
  dashboard: baseContract.output(dashboardSchema),
};

export const ADMIN_AUDIT_MAP = {
  mutations: {},
  reads: ["dashboard"],
} satisfies AdminAuditMap<typeof dashboardSlice>;
