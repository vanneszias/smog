import { auditRoutes } from "./audit";
import { categoriesRoutes } from "./categories";
import { dashboardRoutes } from "./dashboard";
import { emailsRoutes } from "./emails";
import { gesturesRoutes } from "./gestures";
import { maintenanceRoutes } from "./maintenance";
import { muxRoutes } from "./mux";
import { type AdminDeps, adminProcedure } from "./procedure";
import { usersRoutes } from "./users";

/**
 * The `admin` slice of the app router. Each area file returns its part,
 * built from `adminProcedure` (so every procedure is `requireAdmin`), and
 * `router()` checks that together they implement the whole contract.
 */
export function createAdminRouter(deps: AdminDeps) {
  return adminProcedure.router({
    ...dashboardRoutes(),
    ...auditRoutes(),
    ...gesturesRoutes(deps),
    ...categoriesRoutes(deps),
    ...muxRoutes(deps),
    ...usersRoutes(deps),
    ...maintenanceRoutes(deps),
    ...emailsRoutes(deps),
  });
}

export type AdminRouter = ReturnType<typeof createAdminRouter>;
