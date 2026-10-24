import { implementRpc, requireRole } from "@smog/rpc";
import { adminGuard } from "@smog/rpc/audit";
import { TEACHER_PROCEDURE_KINDS, teacherSlice } from "../contract";

const os = implementRpc(teacherSlice);
const guard = adminGuard(TEACHER_PROCEDURE_KINDS);

/**
 * Writing teaching material: the `teacher` role (an `admin` passes too;
 * `UNAUTHORIZED` for a guest, `FORBIDDEN` for everybody else, a translator
 * included), then the audit guard of `@smog/rpc/audit`, which holds every
 * read read-only and makes each mutation build and run its audit entry in
 * its own batch.
 */
export const teacherWriteProcedure = os.use(requireRole("teacher")).use(guard);

/** Reading it for the editor: a teacher, a translator or an admin, same guard. */
export const teacherReadProcedure = os
  .use(requireRole("teacher", "translator"))
  .use(guard);

/** The router builder: no guard of its own, each procedure carries its own. */
export const teacherRouterBuilder = os;
