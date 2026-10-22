import { baseContract } from "@smog/rpc/contract";
import { z } from "zod";
import {
  saveCategoryTranslationInputSchema,
  saveGestureTranslationInputSchema,
  translatableGestureSchema,
  translationCategoryListInputSchema,
  translationCategoryListSchema,
  translationConflictDataSchema,
  translationGestureIdInputSchema,
  translationGestureListInputSchema,
  translationGesturePageSchema,
  translationReportSchema,
  translationSavedSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";

const translationContract = baseContract.errors({
  CONFLICT: { data: translationConflictDataSchema, status: 409 },
});

/**
 * `catalogTranslation.*` (phase 10b task 5): the gesture and category texts
 * in the non-default languages. Unlike `admin.*` these are open to a
 * translator (an admin passes too; `requireRole("translator")`), and like
 * them every write is one D1 batch with its audit entry and the full-text
 * rows of the language, then a new catalog version. The default language's
 * text is only ever changed through `admin.gestures` and `admin.categories`.
 * Reads come from D1, never the catalog snapshot.
 */
export const catalogTranslationContract = {
  categories: {
    /** Every category with its translation in `locale` (a non-default language) and the counts. */
    list: baseContract
      .input(translationCategoryListInputSchema)
      .output(translationCategoryListSchema),
    /**
     * Saves a category's name in `locale`. `VALIDATION` for a language that
     * is not enabled or is the default one; `CONFLICT` `stale` when the
     * name was saved since `expectedUpdatedAt`.
     */
    save: translationContract
      .input(saveCategoryTranslationInputSchema)
      .output(translationSavedSchema),
  },
  gestures: {
    /** One gesture: the default text and every translation it has (`NOT_FOUND`). */
    get: baseContract
      .input(translationGestureIdInputSchema)
      .output(translatableGestureSchema),
    /**
     * Every gesture in catalogue order (default `sort_name`, `id` keyset)
     * with its translation in `locale`, optionally only those that still
     * need one (`status: "needs"`), and the language's counts.
     */
    list: baseContract
      .input(translationGestureListInputSchema)
      .output(translationGesturePageSchema),
    /**
     * Saves a gesture's name, description and keywords in `locale`:
     * replaces that language's text, rebuilds its full-text row in the same
     * batch, leaves every other language alone. Same rules as the
     * category's `save`.
     */
    save: translationContract
      .input(saveGestureTranslationInputSchema)
      .output(translationSavedSchema),
  },
  /** The "needs translation" counts of every enabled non-default language (the coverage card). */
  reports: baseContract.output(z.array(translationReportSchema)),
};

/** Each procedure's kind, by its path below `catalogTranslation` (the router prefixes it for the guard). */
export const CATALOG_TRANSLATION_PROCEDURES = {
  "categories.list": "read",
  "categories.save": {
    audit: "translation.category_save",
    noop: "the name is what is already stored",
  },
  "gestures.get": "read",
  "gestures.list": "read",
  "gestures.save": {
    audit: "translation.gesture_save",
    noop: "the text is what is already stored",
  },
  reports: "read",
} as const satisfies AdminProcedures<typeof catalogTranslationContract>;
