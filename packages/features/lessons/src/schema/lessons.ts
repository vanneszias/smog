/**
 * Lessons and their PDFs (phase 10c, spec 4.4 and 5.4): the caps, template
 * names and building-block schemas the contract, the server, the builder and
 * the export share. Client-safe.
 */
import {
  LESSON_NOTES_MAX,
  LESSON_NUMBER_MAX,
  LESSON_TITLE_MAX,
} from "@smog/db/enums";
import { z } from "zod";

/** The two PDF templates: "for teachers" and "for participants". */
export const LESSON_TEMPLATES = ["teachers", "participants"] as const;
export type LessonTemplate = (typeof LESSON_TEMPLATES)[number];
export const lessonTemplateSchema = z.enum(LESSON_TEMPLATES);

/**
 * How many gestures a PDF holds: 150 for the teachers' template, 80 for the
 * participants' (it embeds a drawing per gesture). A lesson over the limit is
 * refused with a typed error ("split the lesson").
 */
export const LESSON_PDF_LIMITS = {
  participants: 80,
  teachers: 150,
} as const satisfies Record<LessonTemplate, number>;

/** The wall-clock budget of one PDF render in the Worker (spec 5.4). */
export const LESSON_PDF_BUDGET_MS = 25_000;

export const lessonTitleSchema = z.string().trim().min(1).max(LESSON_TITLE_MAX);
export const lessonNotesSchema = z.string().max(LESSON_NOTES_MAX);

/** The optional lesson number ("Les 1"); `null` clears it. */
export const lessonNumberSchema = z
  .number()
  .int()
  .min(0)
  .max(LESSON_NUMBER_MAX)
  .nullable();
