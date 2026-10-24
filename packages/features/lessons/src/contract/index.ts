// biome-ignore-all lint/performance/noBarrelFile: the `@smog/lessons/contract` entry point (client-safe).
/**
 * `@smog/lessons/contract` (phase 10c): the teaching procedures, mounted as
 * `teacher` in `@smog/api`'s `appContract`. Task 2: the teacher information;
 * the drawings (task 3) join the same slice, the lessons follow as their own.
 */
import type { AdminProcedures } from "@smog/admin/contract";
import { TEACHER_INFO_KINDS, teacherInfoContract } from "./teacher-info";

export const teacherSlice = {
  ...teacherInfoContract,
};

export type TeacherContract = typeof teacherSlice;

const KINDS = {
  ...TEACHER_INFO_KINDS,
} as const satisfies AdminProcedures<TeacherContract>;

/** The kinds by full path (`teacher.saveInfo`), as `adminGuard` looks them up. */
export const TEACHER_PROCEDURE_KINDS: Readonly<
  Record<string, AdminProcedures<TeacherContract>[keyof typeof KINDS]>
> = Object.fromEntries(
  Object.entries(KINDS).map(([path, kind]) => [`teacher.${path}`, kind])
);
