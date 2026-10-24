import { implementRpc, requireRole } from "@smog/rpc";
import { adminGuard } from "@smog/rpc/audit";
import { TEACHER_PROCEDURE_KINDS, teacherSlice } from "../contract";

const os = implementRpc(teacherSlice);
const guard = adminGuard(TEACHER_PROCEDURE_KINDS);

/**
 * The teacher procedures: the `teacher` or `translator` role (an `admin`
 * passes both; `UNAUTHORIZED` for a guest, `FORBIDDEN` for any other
 * account), then the audit guard, which holds every read read-only and
 * makes each mutation build and run its audit entry in its own batch. What a
 * translator may not do (write the default language, touch drawings) is
 * checked by the procedure itself.
 */
export const teachingProcedure = os
  .use(requireRole("teacher", "translator"))
  .use(guard);

/** The router builder: no guard of its own, each procedure carries its own. */
export const teacherRouterBuilder = os;

/** Whether `roles` may author teaching material (any language, drawings): a teacher or an admin. */
export function mayAuthor(roles: readonly string[]): boolean {
  return roles.includes("teacher") || roles.includes("admin");
}
