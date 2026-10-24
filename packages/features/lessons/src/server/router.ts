import { infoRoutes } from "./info";
import { teacherRouterBuilder } from "./procedure";

/**
 * The `teacher` slice of the app router. Each procedure carries its own
 * role guard (`teachingProcedure`) and the audit guard; `router()` checks
 * that together they implement the whole contract.
 */
export function createTeacherRouter() {
  return teacherRouterBuilder.router({
    ...infoRoutes(),
  });
}

export type TeacherRouter = ReturnType<typeof createTeacherRouter>;
