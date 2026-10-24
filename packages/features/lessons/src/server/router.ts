import { drawingRoutes } from "./drawings";
import { infoRoutes } from "./info";
import { lessonRoutes } from "./lessons";
import { lessonsRouterBuilder, teacherRouterBuilder } from "./procedure";

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

/**
 * The `lessons` slice of the app router (phase 10c task 4): teachers and
 * admins; every procedure carries the role guard and the audit guard.
 */
export function createLessonsRouter() {
  return lessonsRouterBuilder.router(lessonRoutes());
}

export type LessonsRouter = ReturnType<typeof createLessonsRouter>;
