import { drawingRoutes } from "./drawings";
import { infoRoutes } from "./info";
import { teacherRouterBuilder } from "./procedure";

/**
 * The `teacher` slice of the app router. Each procedure carries its own
 * role guard (`teachingProcedure`, `teacherWriteProcedure`) and the audit
 * guard; `router()` checks that together they implement the whole contract.
 */
export function createTeacherRouter() {
  return teacherRouterBuilder.router({
    ...drawingRoutes(),
    ...infoRoutes(),
  });
}

export type TeacherRouter = ReturnType<typeof createTeacherRouter>;
