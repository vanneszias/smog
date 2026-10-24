// biome-ignore-all lint/performance/noBarrelFile: the `@smog/lessons/contract` entry point (client-safe).
/**
 * `@smog/lessons/contract` (phase 10c): the teaching procedures, mounted as
 * `teacher` in `@smog/api`'s `appContract`: the teacher information (task 2)
 * and the drawings (task 3); the lessons follow as their own.
 */
import type { AdminProcedures } from "@smog/admin/contract";
import { DRAWING_KINDS, drawingsSlice } from "./drawings";
import { TEACHER_INFO_KINDS, teacherInfoContract } from "./teacher-info";

export const teacherSlice = {
  ...teacherInfoContract,
  ...drawingsSlice,
};

export type TeacherContract = typeof teacherSlice;

const KINDS = {
  ...TEACHER_INFO_KINDS,
  ...DRAWING_KINDS,
} as const satisfies AdminProcedures<TeacherContract>;

/** The kinds by full path (`teacher.saveInfo`), as `adminGuard` looks them up. */
export const TEACHER_PROCEDURE_KINDS: Readonly<
  Record<string, AdminProcedures<TeacherContract>[keyof typeof KINDS]>
> = Object.fromEntries(
  Object.entries(KINDS).map(([path, kind]) => [`teacher.${path}`, kind])
);
