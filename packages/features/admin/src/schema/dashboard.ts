/** `admin.dashboard` (A-03): the counts and the newest audit entries. */
import { z } from "zod";
import { auditEntrySchema } from "./audit";

/** How many audit entries the dashboard shows. */
export const DASHBOARD_RECENT_AUDIT = 5;
/** "New users" counts accounts created in this window. */
export const DASHBOARD_NEW_USER_DAYS = 30;

const count = z.number().int().nonnegative();

export const dashboardSchema = z.object({
  categories: z.object({ published: count, total: count }),
  gestures: z.object({ published: count, total: count, unpublished: count }),
  recentAudit: z.array(auditEntrySchema).max(DASHBOARD_RECENT_AUDIT),
  users: z.object({
    admins: count,
    banned: count,
    /** Accounts created in the last `DASHBOARD_NEW_USER_DAYS` days. */
    last30Days: count,
    total: count,
  }),
});

export type Dashboard = z.infer<typeof dashboardSchema>;
