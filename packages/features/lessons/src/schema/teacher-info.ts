/**
 * The teacher-info procedures' inputs and outputs (phase 10c task 2): one
 * gesture's private teaching text in every language, and the stale-locked
 * save of one language. Client-safe. **Private material:** only the
 * role-guarded `teacher.*` procedures return these shapes.
 */
import { localeCodeSchema } from "@smog/config/locale";
import { z } from "zod";
import { teacherInfoFieldsSchema, teacherInfoRowSchema } from "./teacher";

export const teacherInfoGetInputSchema = z.object({
  gestureId: z.string().min(1),
});

/**
 * What the "Teacher info" tabs need for one gesture: its name, the default
 * language, every stored language row (the default language's row is the
 * reference text beside a translation) and the public C keywords of every
 * language (listed beside the private C note).
 */
export const teacherInfoDetailSchema = z.object({
  defaultLocale: z.string(),
  gesture: z.object({
    id: z.string(),
    name: z.string(),
    published: z.boolean(),
    slug: z.string(),
  }),
  keywords: z.record(z.string(), z.array(z.string())),
  rows: z.record(z.string(), teacherInfoRowSchema),
});
export type TeacherInfoDetail = z.infer<typeof teacherInfoDetailSchema>;

export const teacherInfoSaveInputSchema = z.object({
  /** The version the editor read (`null`: it read no row). A different stored version is `CONFLICT`. */
  expectedVersion: z.number().int().min(1).nullable(),
  /** The seven texts of the language: the whole row is replaced. */
  fields: teacherInfoFieldsSchema,
  gestureId: z.string().min(1),
  locale: localeCodeSchema,
});
export type TeacherInfoSaveInput = z.infer<typeof teacherInfoSaveInputSchema>;

/** The version the row has now; `null` when nothing was stored (an empty save of a language without a row). */
export const teacherInfoSavedSchema = z.object({
  version: z.number().int().min(1).nullable(),
});
export type TeacherInfoSaved = z.infer<typeof teacherInfoSavedSchema>;

/** The stored row a save lost to (`null`: the row was deleted since, which only a gesture delete does). */
export const teacherInfoConflictDataSchema = z.object({
  current: teacherInfoRowSchema.nullable(),
  reason: z.literal("stale"),
});
export type TeacherInfoConflictData = z.infer<
  typeof teacherInfoConflictDataSchema
>;

/** How much of a gesture's teaching text a language has (the readiness bar of a lesson). */
export const TEACHER_COVERAGE_STATES = ["own", "fallback", "none"] as const;
export type TeacherCoverageState = (typeof TEACHER_COVERAGE_STATES)[number];
