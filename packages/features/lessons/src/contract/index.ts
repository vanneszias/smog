/**
 * `@smog/lessons/contract` (phase 10c): the `teacher` procedures. Task 3
 * adds the drawings; the teacher-info ones (task 2) join the same slice.
 */
import type { AdminProcedures } from "@smog/admin/contract";
import { DRAWING_KINDS, drawingsSlice } from "./drawings";

export const teacherSlice = {
  ...drawingsSlice,
};

export type TeacherContract = typeof teacherSlice;

const KINDS = {
  ...DRAWING_KINDS,
} as const satisfies AdminProcedures<TeacherContract>;

/** The kinds by full path (`teacher.uploadDrawing`), as `adminGuard` looks them up. */
export const TEACHER_PROCEDURE_KINDS: Readonly<
  Record<string, AdminProcedures<TeacherContract>[keyof typeof KINDS]>
> = Object.fromEntries(
  Object.entries(KINDS).map(([path, kind]) => [`teacher.${path}`, kind])
);
