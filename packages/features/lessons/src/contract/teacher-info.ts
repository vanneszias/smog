import type { AdminProcedures } from "@smog/admin/contract";
import { baseContract } from "@smog/rpc/contract";
import {
  teacherInfoConflictDataSchema,
  teacherInfoDetailSchema,
  teacherInfoGetInputSchema,
  teacherInfoSavedSchema,
  teacherInfoSaveInputSchema,
} from "../schema";

const saveContract = baseContract.errors({
  CONFLICT: { data: teacherInfoConflictDataSchema, status: 409 },
});

/**
 * The teacher-information procedures (phase 10c task 2), mounted as `teacher`
 * in `@smog/api`'s `appContract`. Private teaching material: every procedure
 * needs the `teacher`, `translator` or `admin` role (`UNAUTHORIZED` for a
 * guest, `FORBIDDEN` for anyone else; roles are read from D1 on every
 * request), and the audit guard of `@smog/rpc/audit` holds reads read-only
 * and makes each write build its audit entry in the same D1 batch.
 */
export const teacherInfoContract = {
  /**
   * One gesture's teacher information in every language, the public C
   * keywords of each language and the gesture's name. `NOT_FOUND` for an
   * unknown gesture.
   */
  getInfo: baseContract
    .input(teacherInfoGetInputSchema)
    .output(teacherInfoDetailSchema),
  /**
   * Replaces one language's seven texts. A teacher or an admin writes any
   * enabled language; a translator only the non-default ones (`FORBIDDEN`
   * for the default language: they translate, they do not author).
   * `VALIDATION` (field `locale`: `notEnabled`), `NOT_FOUND` for an unknown
   * gesture, `CONFLICT stale` (with the stored row) when the version moved
   * since `expectedVersion`. Saving what is stored changes nothing and
   * writes no entry.
   */
  saveInfo: saveContract
    .input(teacherInfoSaveInputSchema)
    .output(teacherInfoSavedSchema),
};

/** Each procedure's kind, by its path below `teacher` (the router prefixes it for the guard). */
export const TEACHER_INFO_KINDS = {
  getInfo: "read",
  saveInfo: {
    audit: "teacher.info_save",
    noop: "the texts are what is already stored",
  },
} as const satisfies AdminProcedures<typeof teacherInfoContract>;
