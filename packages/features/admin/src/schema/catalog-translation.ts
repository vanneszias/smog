/**
 * Phase 10b task 5: the schemas of the gesture and category translations
 * (`catalogTranslation.*`). A translator or an admin edits them; the default
 * language's text (the base columns) stays with the admin catalogue editors.
 * Everything exported here is part of `@smog/admin/schema`. Client-safe.
 */
import { localeCodeSchema } from "@smog/config/locale";
import { z } from "zod";
import {
  catalogIdSchema,
  categoryNameSchema,
  gestureDescriptionSchema,
  gestureKeywordsSchema,
  gestureNameSchema,
} from "./catalog";

/** Rows per page of the per-language gesture list. */
export const TRANSLATION_PAGE_MAX = 100;
export const TRANSLATION_PAGE_DEFAULT = 50;

/** `all` gestures, or only those that still `needs` translation in the language. */
export const TRANSLATION_STATUSES = ["all", "needs"] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

const count = z.number().int().nonnegative();

/**
 * The "needs translation" counts of one language (`translationReport` in
 * `@smog/db`): the table's header and the dashboard's coverage card.
 */
export const translationReportSchema = z.object({
  categories: z.object({ missing: count, total: count }),
  gestures: z.object({
    /** Translated name, blank description where the default has one. */
    missingDescription: count,
    /** Translated, no keyword where the default language has some. */
    missingKeywords: count,
    /** No translation: the default name is shown. */
    missingName: count,
    needsTranslation: count,
    total: count,
  }),
  locale: z.string(),
});

export type TranslationReport = z.infer<typeof translationReportSchema>;

const stored = z.object({
  description: z.string(),
  keywords: z.array(z.string()),
  name: z.string(),
});

/** A gesture's text in one language, with the `updatedAt` its editor read (the lock). */
export const gestureTranslationSchema = stored.extend({
  /** Epoch milliseconds: pass as `expectedUpdatedAt` to `save`. */
  updatedAt: z.number().int(),
});

/** One gesture for the editor: the default language's text and every translation it has. */
export const translatableGestureSchema = z.object({
  id: z.string(),
  published: z.boolean(),
  slug: z.string(),
  /** The default language's text, which each tab shows beside its own. */
  source: stored,
  /** By language code; a language without an entry has no translation yet. */
  translations: z.record(z.string(), gestureTranslationSchema),
});

export type TranslatableGesture = z.infer<typeof translatableGestureSchema>;

export const translationGestureListInputSchema = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(TRANSLATION_PAGE_MAX)
    .default(TRANSLATION_PAGE_DEFAULT),
  locale: localeCodeSchema,
  /** A `normalizeText` substring of the default name. */
  q: z.string().max(120).optional(),
  status: z.enum(TRANSLATION_STATUSES).default("all"),
});

export type TranslationGestureListInput = z.input<
  typeof translationGestureListInputSchema
>;

/** A gesture's row in the per-language list. */
export const translationGestureRowSchema = z.object({
  id: z.string(),
  /** Default-language keywords (a count to compare with the translation's). */
  keywordCount: count,
  /** The default language's name. */
  name: z.string(),
  needsTranslation: z.boolean(),
  published: z.boolean(),
  slug: z.string(),
  /** `null` while the language has no translation row. */
  translation: z
    .object({
      description: z.string(),
      keywordCount: count,
      name: z.string(),
      updatedAt: z.number().int(),
    })
    .nullable(),
});

export type TranslationGestureRow = z.infer<typeof translationGestureRowSchema>;

export const translationGesturePageSchema = z.object({
  items: z.array(translationGestureRowSchema),
  nextCursor: z.string().nullable(),
  report: translationReportSchema,
});

export type TranslationGesturePage = z.infer<
  typeof translationGesturePageSchema
>;

export const translationGestureIdInputSchema = z.object({
  id: catalogIdSchema,
});

/**
 * Saves one gesture's text in one language (an enabled, non-default one:
 * else `VALIDATION`). It replaces the language's name, description and
 * keywords and leaves every other language and the default text alone.
 */
export const saveGestureTranslationInputSchema = z.object({
  description: gestureDescriptionSchema.default(""),
  /**
   * The `updatedAt` of the translation the editor read, `null` when it had
   * none: a translation saved by someone else since is `CONFLICT` `stale`.
   */
  expectedUpdatedAt: z.number().int().nonnegative().nullable(),
  id: catalogIdSchema,
  keywords: gestureKeywordsSchema.default([]),
  locale: localeCodeSchema,
  name: gestureNameSchema,
});

export type SaveGestureTranslationInput = z.input<
  typeof saveGestureTranslationInputSchema
>;

// --- Categories -------------------------------------------------------------

export const translationCategoryListInputSchema = z.object({
  locale: localeCodeSchema,
  status: z.enum(TRANSLATION_STATUSES).default("all"),
});

export const translationCategoryRowSchema = z.object({
  id: z.string(),
  /** The default language's name. */
  name: z.string(),
  needsTranslation: z.boolean(),
  published: z.boolean(),
  slug: z.string(),
  translation: z
    .object({ name: z.string(), updatedAt: z.number().int() })
    .nullable(),
});

export type TranslationCategoryRow = z.infer<
  typeof translationCategoryRowSchema
>;

export const translationCategoryListSchema = z.object({
  items: z.array(translationCategoryRowSchema),
  report: translationReportSchema,
});

export type TranslationCategoryList = z.infer<
  typeof translationCategoryListSchema
>;

export const saveCategoryTranslationInputSchema = z.object({
  expectedUpdatedAt: z.number().int().nonnegative().nullable(),
  id: catalogIdSchema,
  locale: localeCodeSchema,
  name: categoryNameSchema,
});

export type SaveCategoryTranslationInput = z.input<
  typeof saveCategoryTranslationInputSchema
>;

export const translationSavedSchema = z.object({
  /** The new `updatedAt` of the saved translation (epoch milliseconds). */
  updatedAt: z.number().int(),
});

/** Why a translation save is `CONFLICT`: someone saved it since it was read. */
export const translationConflictDataSchema = z.object({
  reason: z.literal("stale"),
});
