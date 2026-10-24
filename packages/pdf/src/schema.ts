/**
 * The document description the engine renders: plain, validated data. The
 * caller (`@smog/lessons/server`) resolves the language fallback and the
 * unpublished gestures before it builds this; the engine only draws what it
 * is given. Nothing here knows D1, R2 or a request.
 */
import { z } from "zod";

export const PDF_TEMPLATES = ["teachers", "participants"] as const;
export type PdfTemplate = (typeof PDF_TEMPLATES)[number];

/** Hard caps of the engine itself (the lesson limits are the caller's). */
export const PDF_ENGINE_LIMITS = {
  /** One text field of a row (the teacher-info cap). */
  fieldChars: 2000,
  keywordChars: 120,
  keywords: 40,
  notesChars: 5000,
  rows: 150,
  sections: 100,
  titleChars: 200,
} as const;

const text = (max: number) => z.string().max(max);

const drawingSchema = z.object({
  /** The stored image bytes: PNG or JPEG embed; anything else is skipped. */
  bytes: z.custom<Uint8Array>((value) => value instanceof Uint8Array, {
    message: "Expected bytes",
  }),
  /** Printed under the drawing. */
  credit: text(120).default(""),
  step: z.union([z.literal(1), z.literal(2)]),
});

const pdfRowSchema = z.object({
  /** Teacher info BW (movement). */
  bw: text(PDF_ENGINE_LIMITS.fieldChars).default(""),
  /** The private C note around the keywords. */
  cNote: text(PDF_ENGINE_LIMITS.fieldChars).default(""),
  /** Drawings of the gesture, at most one per step. */
  drawings: z.array(drawingSchema).max(2).default([]),
  /** True when the text is the default language's (grey, dagger). */
  fallback: z.boolean().default(false),
  /** Teacher info HC (hand configuration). */
  hc: text(PDF_ENGINE_LIMITS.fieldChars).default(""),
  /** An id for the engine's report (a skipped drawing); never printed. */
  id: z.string().max(80).default(""),
  /** The C words (the public keywords of the language), in order. */
  keywords: z
    .array(text(PDF_ENGINE_LIMITS.keywordChars))
    .max(PDF_ENGINE_LIMITS.keywords)
    .default([]),
  /** The free note, printed in brackets (teachers only). */
  note: text(PDF_ENGINE_LIMITS.fieldChars).default(""),
  /** Teacher info OR (orientation). */
  or: text(PDF_ENGINE_LIMITS.fieldChars).default(""),
  /** Teacher info PL (place). */
  pl: text(PDF_ENGINE_LIMITS.fieldChars).default(""),
  /** The short summary for participants (HC is used when it is empty). */
  summary: text(PDF_ENGINE_LIMITS.fieldChars).default(""),
  word: text(PDF_ENGINE_LIMITS.titleChars),
});

const pdfSectionSchema = z.object({
  rows: z.array(pdfRowSchema).max(PDF_ENGINE_LIMITS.rows),
  /** A section title; null for the rows before the first section. */
  title: text(PDF_ENGINE_LIMITS.titleChars).nullable().default(null),
});

const pdfLabelsSchema = z.object({
  /** The footnote under pages with a default-language row ("shown in Dutch"). */
  fallbackFootnote: text(200),
  /** The labels of the teachers' table (HC, PL, OR, BW, C). */
  fields: z
    .object({
      bw: text(12),
      c: text(12),
      hc: text(12),
      or: text(12),
      pl: text(12),
    })
    .default({ bw: "BW", c: "C", hc: "HC", or: "OR", pl: "PL" }),
  /** "Les": printed before the number in the header. */
  lesson: text(40),
  /** The participants' `C:` line prefix. */
  participantsC: text(12).default("C:"),
});

export const lessonPdfDocumentSchema = z.object({
  /** The author in the metadata. */
  author: text(120).default("SMOG"),
  labels: pdfLabelsSchema,
  /** BCP 47 tag of the document (the metadata language, upper-casing). */
  locale: z.string().min(2).max(35),
  /** The lesson notes, above the table. */
  notes: text(PDF_ENGINE_LIMITS.notesChars).default(""),
  /** The lesson number; the header prints "Les <number>" when set. */
  number: z.number().int().min(0).max(100_000).nullable().default(null),
  sections: z.array(pdfSectionSchema).max(PDF_ENGINE_LIMITS.sections),
  template: z.enum(PDF_TEMPLATES),
  title: text(PDF_ENGINE_LIMITS.titleChars).default(""),
});

export type LessonPdfDocumentInput = z.input<typeof lessonPdfDocumentSchema>;
export type LessonPdfDocument = z.output<typeof lessonPdfDocumentSchema>;
export type PdfRow = z.output<typeof pdfRowSchema>;
export type PdfSection = z.output<typeof pdfSectionSchema>;

/** The binary assets the engine embeds (the caller loads them). */
export interface PdfAssets {
  boldFont: Uint8Array;
  /** The logo, a PNG of at most 256 px. */
  logo: Uint8Array;
  regularFont: Uint8Array;
}

/** What `renderLessonPdfDetailed` reports besides the bytes. */
export interface PdfRenderReport {
  bytes: Uint8Array;
  /** Rows whose drawing could not be embedded (the row `id`, or the word). */
  droppedDrawings: string[];
  pageCount: number;
  /** Characters Figtree lacks, replaced by a question mark. */
  replacedCharacters: number;
  /** Rows whose text was cut because a single row would not fit a page. */
  truncatedRows: string[];
}

/** A document the engine refuses (bad shape); the message names the field. */
export class PdfDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfDocumentError";
  }
}
