import { drawingRoutes } from "./drawings";
import { teacherRouterBuilder } from "./procedure";

/**
 * The `teacher` slice of the app router. Each procedure carries its own
 * role guard (`teacherWriteProcedure`, `teacherReadProcedure`) and the audit
 * guard; `router()` checks that together they implement the whole contract.
 */
export function createTeacherRouter() {
  return teacherRouterBuilder.router({
    ...drawingRoutes(),
  });
}

export type TeacherRouter = ReturnType<typeof createTeacherRouter>;
