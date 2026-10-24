/**
 * The lesson procedures' inputs and outputs (phase 10c task 4, spec 5.3):
 * the list, one lesson with its sections and items, the stale-locked
 * whole-lesson save, create, duplicate, delete, the readiness of a language
 * and the picker's drawing markers. Client-safe. **Private material:** only
 * the role-guarded `lessons.*` procedures return these shapes (teachers and
 * admins; a translator has no lesson access).
 */
import { localeCodeSchema } from "@smog/config/locale";
import { LESSON_TITLE_MAX } from "@smog/db/enums";
import { z } from "zod";
import {
  LESSON_PDF_LIMITS,
  lessonNotesSchema,
  lessonNumberSchema,
  lessonTemplateSchema,
  lessonTitleSchema,
} from "./lessons";
import { TEACHER_COVERAGE_STATES } from "./teacher-info";

/** How many gestures a lesson holds: what the largest PDF template takes (task 5 refuses a PDF over its own limit). */
export const LESSON_MAX_GESTURES = LESSON_PDF_LIMITS.teachers;
/** How many sections a lesson holds. */
export const LESSON_MAX_SECTIONS = 50;
/** The search box of the lesson list. */
export const LESSON_SEARCH_MAX = 100;
/** One page of the lesson list. */
export const LESSON_LIST_PAGE = 20;

/** A lesson's title and notes in one language. A language with no title and no notes is not stored. */
export const lessonTextInputSchema = z.object({
  notes: lessonNotesSchema,
  title: z.string().trim().max(LESSON_TITLE_MAX),
});
export type LessonTextInput = z.infer<typeof lessonTextInputSchema>;

/** A section as the builder saves it: a client-made UUID, its titles per language and its gestures in order. */
export const lessonSectionInputSchema = z.object({
  gestureIds: z.array(z.string().min(1)).max(LESSON_MAX_GESTURES),
  id: z.uuid(),
  titles: z.record(localeCodeSchema, z.string().trim().max(LESSON_TITLE_MAX)),
});
export type LessonSectionInput = z.infer<typeof lessonSectionInputSchema>;

// ---- list -----------------------------------------------------------------

/** The keyset cursor of the list: the last row's `updatedAt` and id. */
export const lessonCursorSchema = z.object({
  id: z.string().min(1),
  updatedAt: z.number().int(),
});
export type LessonCursor = z.infer<typeof lessonCursorSchema>;

export const lessonListInputSchema = z.object({
  cursor: lessonCursorSchema.nullish(),
  /** Only the viewer's own lessons. */
  mine: z.boolean().optional(),
  /** A title (in any language) contains this text. */
  query: z.string().trim().max(LESSON_SEARCH_MAX).optional(),
});
export type LessonListInput = z.infer<typeof lessonListInputSchema>;

export const lessonListItemSchema = z.object({
  authorName: z.string().nullable(),
  /** The viewer is the author or an admin: may edit and delete. */
  canEdit: z.boolean(),
  gestureCount: z.number().int().nonnegative(),
  id: z.string(),
  mine: z.boolean(),
  number: z.number().int().nullable(),
  /** The title in the viewer's language, else the default language's, else any. */
  title: z.string(),
  /** The language `title` is in. */
  titleLocale: z.string(),
  updatedAt: z.number().int(),
  version: z.number().int().min(1),
});
export type LessonListItem = z.infer<typeof lessonListItemSchema>;

export const lessonListSchema = z.object({
  items: z.array(lessonListItemSchema),
  /** Pass as `cursor` for the next page; `null` on the last. */
  nextCursor: lessonCursorSchema.nullable(),
});
export type LessonList = z.infer<typeof lessonListSchema>;

// ---- one lesson -----------------------------------------------------------

export const lessonIdInputSchema = z.object({ id: z.string().min(1) });
export type LessonIdInput = z.infer<typeof lessonIdInputSchema>;

export const lessonItemSchema = z.object({
  /** The gesture has at least one drawing (teachers and admins only see this). */
  hasDrawing: z.boolean(),
  id: z.string(),
  /** The gesture's name in the viewer's language (default text when untranslated). */
  name: z.string(),
  playbackId: z.string(),
  /** Unpublished since it was added: kept, flagged, skipped in the PDF. */
  published: z.boolean(),
  slug: z.string(),
});
export type LessonItem = z.infer<typeof lessonItemSchema>;

export const lessonSectionSchema = z.object({
  id: z.string(),
  items: z.array(lessonItemSchema),
  titles: z.record(z.string(), z.string()),
});
export type LessonSection = z.infer<typeof lessonSectionSchema>;

export const lessonDetailSchema = z.object({
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  canEdit: z.boolean(),
  createdAt: z.number().int(),
  id: z.string(),
  number: z.number().int().nullable(),
  sections: z.array(lessonSectionSchema),
  /** Title and notes per language the lesson has them in. */
  translations: z.record(z.string(), lessonTextInputSchema),
  /** The gestures before the first section, in order. */
  ungrouped: z.array(lessonItemSchema),
  updatedAt: z.number().int(),
  /** The stale-lock: `update` must send the version it read. */
  version: z.number().int().min(1),
});
export type LessonDetail = z.infer<typeof lessonDetailSchema>;

// ---- create, update, duplicate, delete ------------------------------------

export const lessonCreateInputSchema = z.object({
  /** The language the first title is in (an enabled one). */
  locale: localeCodeSchema,
  number: lessonNumberSchema.optional(),
  title: lessonTitleSchema,
});
export type LessonCreateInput = z.infer<typeof lessonCreateInputSchema>;

export const lessonCreatedSchema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
});
export type LessonCreated = z.infer<typeof lessonCreatedSchema>;

/**
 * The whole lesson as the builder holds it (autosave sends it whole, with the
 * version it read): the server compares it with what is stored, writes the
 * difference in one batch and bumps the version.
 */
export const lessonUpdateInputSchema = z.object({
  expectedVersion: z.number().int().min(1),
  id: z.string().min(1),
  number: lessonNumberSchema,
  sections: z.array(lessonSectionInputSchema).max(LESSON_MAX_SECTIONS),
  translations: z.record(localeCodeSchema, lessonTextInputSchema),
  /** The gestures before the first section. */
  ungrouped: z.array(z.string().min(1)).max(LESSON_MAX_GESTURES),
});
export type LessonUpdateInput = z.infer<typeof lessonUpdateInputSchema>;

/** The version the lesson has now (`unchanged`: the save changed nothing and kept it). */
export const lessonSavedSchema = z.object({
  unchanged: z.boolean(),
  updatedAt: z.number().int(),
  version: z.number().int().min(1),
});
export type LessonSaved = z.infer<typeof lessonSavedSchema>;

/** Why an update lost: the lesson as stored now. */
export const lessonConflictDataSchema = z.object({
  current: lessonDetailSchema,
  reason: z.literal("stale"),
});
export type LessonConflictData = z.infer<typeof lessonConflictDataSchema>;

export const lessonDeletedSchema = z.object({ deleted: z.literal(true) });

// ---- readiness and picker markers -----------------------------------------

export const lessonReadinessInputSchema = z.object({
  id: z.string().min(1),
  locale: localeCodeSchema,
});

/** How many of a lesson's published gestures have teaching text in a language (the readiness bar). */
export const lessonReadinessSchema = z.object({
  /** Published gestures that have no teaching text of their own but the default language's. */
  fallback: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      gestureId: z.string(),
      state: z.enum(TEACHER_COVERAGE_STATES),
    })
  ),
  locale: z.string(),
  none: z.number().int().nonnegative(),
  own: z.number().int().nonnegative(),
  /** Published gestures the counts cover (unpublished ones are skipped in the PDF). */
  total: z.number().int().nonnegative(),
});
export type LessonReadiness = z.infer<typeof lessonReadinessSchema>;

export const gestureMarkersInputSchema = z.object({
  gestureIds: z.array(z.string().min(1)).max(100),
});

/** The picker's marker: which of the asked gestures have a drawing (private: not in the public search). */
export const gestureMarkersSchema = z.object({
  withDrawing: z.array(z.string()),
});
export type GestureMarkers = z.infer<typeof gestureMarkersSchema>;

// ---- the export dialog's preview -------------------------------------------

export const lessonExportPreviewInputSchema = z.object({
  id: z.string().min(1),
  locale: localeCodeSchema,
  template: lessonTemplateSchema,
});
export type LessonExportPreviewInput = z.infer<
  typeof lessonExportPreviewInputSchema
>;

/** A gesture the PDF would print with a gap or a default-language text. */
export const lessonExportIssueSchema = z.object({
  /** It prints text of the default language (grey, dagger). */
  fallback: z.boolean(),
  id: z.string(),
  /** Nothing to print for it in either language, the name apart. */
  missing: z.boolean(),
  name: z.string(),
  /** Participants' sheet: no drawing at all. */
  noDrawing: z.boolean(),
  /** Participants' sheet: a drawing exists but is a WebP, which the PDF cannot hold (upload it again as PNG or JPEG). */
  unsupportedDrawing: z.boolean(),
});
export type LessonExportIssue = z.infer<typeof lessonExportIssueSchema>;

/**
 * What a PDF of the lesson would contain: how many gestures, the cap of the
 * template, the unpublished gestures left out and the gestures with a gap.
 * `overLimit`: the lesson has more gestures than the template takes, and the
 * download is refused ("split the lesson").
 */
export const lessonExportPreviewSchema = z.object({
  gestures: z.number().int().nonnegative(),
  issues: z.array(lessonExportIssueSchema),
  limit: z.number().int().positive(),
  overLimit: z.boolean(),
  skipped: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type LessonExportPreview = z.infer<typeof lessonExportPreviewSchema>;
