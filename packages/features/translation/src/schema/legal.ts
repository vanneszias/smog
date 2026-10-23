/** The legal texts' shapes (phase 10b task 7). Client-safe. */
import { localeCodeSchema } from "@smog/config/locale";
import { LEGAL_KINDS } from "@smog/i18n/legal/markup";
import { z } from "zod";

export const legalKindSchema = z.enum(LEGAL_KINDS);

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  });

/** The text of a version: validated against `validateLegalDocument` in the handler (it needs the kind). */
const contentSchema = z.unknown();

const textRef = z.object({
  kind: legalKindSchema,
  locale: localeCodeSchema,
});
export type LegalTextRef = z.infer<typeof textRef>;
export const legalRefInputSchema = textRef;

/** A published version as the history and the overview list it. */
export const legalVersionSchema = z.object({
  effectiveDate: z.string(),
  publishedAt: z.number().int(),
  /** Who published it (a name), `null` for the seeded version or a deleted account. */
  publishedBy: z.string().nullable(),
  version: z.number().int(),
});
export type LegalVersion = z.infer<typeof legalVersionSchema>;

export const legalDraftSchema = z.object({
  content: z.unknown(),
  /** Epoch ms of the last save: the `expectedUpdatedAt` of the next save and of the publish. */
  updatedAt: z.number().int(),
  /** Who saved it last. */
  updatedBy: z.string().nullable(),
  /** The number it keeps until it is published (a publish renumbers it after the highest published version). */
  version: z.number().int(),
});
export type LegalDraft = z.infer<typeof legalDraftSchema>;

/** One row of the overview: a text and its two states. */
export const legalOverviewItemSchema = z.object({
  draft: z.object({ updatedAt: z.number().int() }).nullable(),
  kind: legalKindSchema,
  locale: z.string(),
  /** The current published version; `null` when the language has none (the Dutch text shows). */
  published: legalVersionSchema.nullable(),
});
export type LegalOverviewItem = z.infer<typeof legalOverviewItemSchema>;

export const legalOverviewSchema = z.object({
  items: z.array(legalOverviewItemSchema),
});
export type LegalOverview = z.infer<typeof legalOverviewSchema>;

/** What the editor opens: the draft, the published text, the Dutch text to translate from, and the history. */
export const legalDetailSchema = z.object({
  /** The Dutch published text (the canonical source), for any other language. */
  canonical: z.unknown().nullable(),
  draft: legalDraftSchema.nullable(),
  history: z.array(legalVersionSchema),
  kind: legalKindSchema,
  locale: z.string(),
  published: legalVersionSchema.extend({ content: z.unknown() }).nullable(),
});
export type LegalDetail = z.infer<typeof legalDetailSchema>;

export const legalVersionInputSchema = textRef.extend({
  version: z.number().int().positive(),
});
export type LegalVersionInput = z.infer<typeof legalVersionInputSchema>;

export const legalVersionContentSchema = legalVersionSchema.extend({
  content: z.unknown(),
});

export const legalSaveInputSchema = textRef.extend({
  content: contentSchema,
  /** The `updatedAt` of the draft the editor opened; `null` when there was none. */
  expectedUpdatedAt: z.number().int().nullable(),
});
export type LegalSaveInput = z.infer<typeof legalSaveInputSchema>;

export const legalSaveResultSchema = z.object({
  draft: legalDraftSchema,
});

export const legalPublishInputSchema = textRef.extend({
  effectiveDate: isoDateSchema,
  /** The `updatedAt` of the draft being published. */
  expectedUpdatedAt: z.number().int(),
});
export type LegalPublishInput = z.infer<typeof legalPublishInputSchema>;

export const legalRestoreInputSchema = textRef.extend({
  effectiveDate: isoDateSchema,
  /** The published version whose text becomes the new current one. */
  version: z.number().int().positive(),
});
export type LegalRestoreInput = z.infer<typeof legalRestoreInputSchema>;

/** `CONFLICT` of a save or a publish: the draft changed (or is gone) since the editor opened it. */
export const legalConflictDataSchema = z.object({
  /** The draft as stored now; `null` when there is none. */
  current: legalDraftSchema.nullable(),
  /** The highest published version, so the editor can tell that a restore intervened. */
  publishedVersion: z.number().int().nullable(),
});
export type LegalConflictData = z.infer<typeof legalConflictDataSchema>;

/**
 * A refused text is a `VALIDATION` whose `fieldErrors.content` lists the
 * issue codes and whose `fieldErrors["content@<path>"]` names the code at a
 * place in the document (`content@sections.2.blocks.0`).
 */
export const LEGAL_ISSUE_PREFIX = "content@";
