import type { AdminProcedures } from "@smog/admin/contract";
import { baseContract } from "@smog/rpc/contract";
import {
  gestureMarkersInputSchema,
  gestureMarkersSchema,
  lessonConflictDataSchema,
  lessonCreatedSchema,
  lessonCreateInputSchema,
  lessonDeletedSchema,
  lessonDetailSchema,
  lessonExportPreviewInputSchema,
  lessonExportPreviewSchema,
  lessonIdInputSchema,
  lessonListInputSchema,
  lessonListSchema,
  lessonReadinessInputSchema,
  lessonReadinessSchema,
  lessonSavedSchema,
  lessonUpdateInputSchema,
} from "../schema";

const updateContract = baseContract.errors({
  CONFLICT: { data: lessonConflictDataSchema, status: 409 },
});

/**
 * The lesson procedures (phase 10c task 4), mounted as `lessons` in
 * `@smog/api`'s `appContract`. Private teaching material: every procedure
 * needs the `teacher` role (an `admin` passes; `UNAUTHORIZED` for a guest,
 * `FORBIDDEN` for anyone else, a translator included; roles are read from D1
 * on every request). All teachers read every lesson and may duplicate one;
 * only the author or an admin updates or deletes it (`FORBIDDEN`). The audit
 * guard holds reads read-only and makes each write build its audit entry in
 * the same D1 batch.
 */
export const lessonsContract = {
  /** A new lesson with one title. `VALIDATION` (field `locale`: `notEnabled`). */
  create: baseContract
    .input(lessonCreateInputSchema)
    .output(lessonCreatedSchema),
  /** Removes a lesson with its sections and items; `NOT_FOUND` for an unknown one. */
  delete: baseContract.input(lessonIdInputSchema).output(lessonDeletedSchema),
  /**
   * Copies a lesson (titles, notes, sections, gestures) into a new one the
   * caller authors. `NOT_FOUND` for an unknown lesson.
   */
  duplicate: baseContract
    .input(lessonIdInputSchema)
    .output(lessonCreatedSchema),
  /**
   * What the PDF in a template and language would contain: its gestures, the
   * unpublished ones left out, those that print default-language text or
   * have nothing to print, and the template's cap (`overLimit`).
   * `NOT_FOUND` for an unknown lesson; `VALIDATION` (field `locale`:
   * `notEnabled`). The PDF itself is `GET /api/teacher/lessons/<id>/pdf`.
   */
  exportPreview: baseContract
    .input(lessonExportPreviewInputSchema)
    .output(lessonExportPreviewSchema),
  /** Which of the asked gestures have a drawing (the picker's marker). */
  gestureMarkers: baseContract
    .input(gestureMarkersInputSchema)
    .output(gestureMarkersSchema),
  /** One lesson with its sections and gestures in order; `NOT_FOUND` for an unknown one. */
  get: baseContract.input(lessonIdInputSchema).output(lessonDetailSchema),
  /** Lessons, newest change first, by keyset; search in any language's title and "mine". */
  list: baseContract.input(lessonListInputSchema).output(lessonListSchema),
  /** How many of a lesson's published gestures have teaching text in a language. */
  readiness: baseContract
    .input(lessonReadinessInputSchema)
    .output(lessonReadinessSchema),
  /**
   * Replaces the lesson with the whole state the builder holds. `CONFLICT
   * stale` (with the lesson as stored) when the version moved since
   * `expectedVersion`; `VALIDATION` with the field `items` (`duplicate`,
   * `tooMany`, `unknown`, `unpublished`: a gesture new to the lesson must be
   * published), `sections` (`tooMany`, `idTaken`), `title` (`required`) or
   * `locale` (`notEnabled`); `FORBIDDEN` for a teacher who is not the author.
   * Saving what is stored changes nothing and writes no entry.
   */
  update: updateContract
    .input(lessonUpdateInputSchema)
    .output(lessonSavedSchema),
};

export type LessonsContract = typeof lessonsContract;

/** Each procedure's kind, by its path below `lessons` (the router prefixes it for the guard). */
export const LESSON_KINDS = {
  create: { audit: "lesson.create" },
  delete: { audit: "lesson.delete" },
  duplicate: { audit: "lesson.duplicate" },
  exportPreview: "read",
  gestureMarkers: "read",
  get: "read",
  list: "read",
  readiness: "read",
  update: {
    audit: "lesson.update",
    noop: "the lesson is what is already stored",
  },
} as const satisfies AdminProcedures<LessonsContract>;

/** The kinds by full path (`lessons.update`), as `adminGuard` looks them up. */
export const LESSON_PROCEDURE_KINDS: Readonly<
  Record<string, AdminProcedures<LessonsContract>[keyof typeof LESSON_KINDS]>
> = Object.fromEntries(
  Object.entries(LESSON_KINDS).map(([path, kind]) => [`lessons.${path}`, kind])
);
