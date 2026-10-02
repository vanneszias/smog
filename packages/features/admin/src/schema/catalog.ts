/**
 * Task 2: the gesture and category admin schemas (`AdminGestureRow`,
 * inputs, limits; ruling 8). Everything exported here is part of
 * `@smog/admin/schema` (`index.ts` re-exports this file). Client-safe.
 */
import { normalizeText } from "@smog/utils";
import { z } from "zod";

/** A gesture name, after trimming (ruling 8; contract only, no DB CHECK). */
export const GESTURE_NAME_MAX = 120;
export const GESTURE_DESCRIPTION_MAX = 2000;
export const GESTURE_KEYWORDS_MAX = 30;
export const GESTURE_KEYWORD_MAX = 60;
export const GESTURE_CATEGORIES_MAX = 20;
export const CATEGORY_NAME_MAX = 60;
/** `admin.categories.list` returns at most this many (the catalogue has tens). */
export const ADMIN_CATEGORIES_MAX = 100;
export const ADMIN_GESTURE_PAGE_MAX = 100;
export const ADMIN_GESTURE_PAGE_DEFAULT = 50;
/** `admin.gestures.saveMany`: the table editor's rows per save. */
export const SAVE_MANY_MAX = 50;
/** `admin.gestures.bulkUpdate`: the selected rows per call. */
export const BULK_UPDATE_MAX = 100;

/**
 * A gesture or category id. The FTS rebuild inlines ids into SQL
 * (`@smog/db` `rebuildGesturesFtsSql`), so only UUID-like ids pass.
 */
export const catalogIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "invalid id");

export const gestureNameSchema = z.string().trim().min(1).max(GESTURE_NAME_MAX);
export const gestureDescriptionSchema = z
  .string()
  .trim()
  .max(GESTURE_DESCRIPTION_MAX);

/**
 * Keywords: at most 30, each 1..60 characters after trimming, de-duplicated
 * by `normalizeText` equality (`Café` and `cafe` are one keyword), the
 * first spelling and the order kept.
 */
export const gestureKeywordsSchema = z
  .array(z.string().trim().min(1).max(GESTURE_KEYWORD_MAX))
  .max(GESTURE_KEYWORDS_MAX)
  .transform((keywords) => {
    const seen = new Set<string>();
    return keywords.filter((keyword) => {
      const key = normalizeText(keyword);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  });

/** 1..20 categories (duplicates dropped); unpublished ones are allowed. */
export const gestureCategoryIdsSchema = z
  .array(catalogIdSchema)
  .min(1)
  .max(GESTURE_CATEGORIES_MAX)
  .transform((ids) => [...new Set(ids)]);

/** A Mux playback id (public). */
export const playbackIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "invalid playback id");
/** A Mux asset id; `null` clears it. */
export const muxAssetIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "invalid asset id");

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(CATEGORY_NAME_MAX);

/** Epoch milliseconds: the `updatedAt` the editor read (optimistic lock). */
const expectedUpdatedAtSchema = z.number().int().nonnegative();

/**
 * Why a catalogue write is `CONFLICT` (the `data` of the error):
 * - `stale`: `ids` changed since they were read (`expectedUpdatedAt`);
 *   nothing was written;
 * - `duplicateName`: another category has a `normalizeText`-equal name;
 * - `published` / `sponsored`: a gesture cannot be deleted (unpublish it
 *   first; a sponsored one is never deleted);
 * - `inUse`: a category that gestures use cannot be deleted (unpublish it).
 */
export const CATALOG_CONFLICT_REASONS = [
  "stale",
  "duplicateName",
  "published",
  "sponsored",
  "inUse",
] as const;
export type CatalogConflictReason = (typeof CATALOG_CONFLICT_REASONS)[number];

export const catalogConflictDataSchema = z.object({
  /** The stale rows (`stale` only). */
  ids: z.array(z.string()).optional(),
  reason: z.enum(CATALOG_CONFLICT_REASONS),
});

export type CatalogConflictData = z.infer<typeof catalogConflictDataSchema>;

// --- Gestures ---------------------------------------------------------------

export const adminGestureCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Whether the category is published (hidden ones are marked in the UI). */
  published: z.boolean(),
  slug: z.string(),
});

/** A gesture as the admin list shows it (published or not). */
export const adminGestureRowSchema = z.object({
  /** Every category, published or not, in category order. */
  categories: z.array(adminGestureCategorySchema),
  /** The table editor edits it inline. */
  description: z.string(),
  id: z.string(),
  /** In the editor's order. */
  keywords: z.array(z.string()),
  muxAssetId: z.string().nullable(),
  name: z.string(),
  playbackId: z.string(),
  /** Epoch milliseconds; `null` while unpublished. */
  publishedAt: z.number().int().nullable(),
  slug: z.string(),
  /** Epoch milliseconds: pass as `expectedUpdatedAt` to `update`. */
  updatedAt: z.number().int(),
});

export const adminGestureDetailSchema = adminGestureRowSchema.extend({
  /** Epoch milliseconds. */
  createdAt: z.number().int(),
});

export type AdminGestureCategory = z.infer<typeof adminGestureCategorySchema>;
export type AdminGestureRow = z.infer<typeof adminGestureRowSchema>;
export type AdminGestureDetail = z.infer<typeof adminGestureDetailSchema>;

export const ADMIN_GESTURE_STATUSES = [
  "all",
  "published",
  "unpublished",
] as const;
export type AdminGestureStatus = (typeof ADMIN_GESTURE_STATUSES)[number];

export const adminGestureListInputSchema = z.object({
  /** Any of these category ids (published or not). */
  category: z.array(catalogIdSchema).max(GESTURE_CATEGORIES_MAX).optional(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(ADMIN_GESTURE_PAGE_MAX)
    .default(ADMIN_GESTURE_PAGE_DEFAULT),
  /** A `normalizeText` substring of the name or of a keyword. */
  q: z.string().max(GESTURE_NAME_MAX).optional(),
  status: z.enum(ADMIN_GESTURE_STATUSES).default("all"),
});

export type AdminGestureListInput = z.input<typeof adminGestureListInputSchema>;
export type AdminGestureListQuery = z.output<
  typeof adminGestureListInputSchema
>;

const count = z.number().int().nonnegative();

export const adminGesturePageSchema = z.object({
  /**
   * For the `q` and `category` filters, whatever the status: the numbers
   * the status tabs show.
   */
  counts: z.object({ published: count, total: count, unpublished: count }),
  items: z.array(adminGestureRowSchema),
  /** Pass as `cursor` for the next page; `null` on the last. */
  nextCursor: z.string().nullable(),
});

export type AdminGesturePage = z.infer<typeof adminGesturePageSchema>;

export const gestureIdInputSchema = z.object({ id: catalogIdSchema });

export const checkNameInputSchema = z.object({
  excludeId: catalogIdSchema.optional(),
  name: gestureNameSchema,
});

export const checkNameResultSchema = z.object({
  /** Gestures whose name is `normalizeText`-equal (a warning, not an error). */
  duplicates: z.array(
    z.object({ id: z.string(), name: z.string(), slug: z.string() })
  ),
});

export const createGestureInputSchema = z.object({
  categoryIds: gestureCategoryIdsSchema,
  description: gestureDescriptionSchema.default(""),
  keywords: gestureKeywordsSchema.default([]),
  muxAssetId: muxAssetIdSchema.nullish(),
  name: gestureNameSchema,
  playbackId: playbackIdSchema,
  published: z.boolean().default(true),
});

export type CreateGestureInput = z.input<typeof createGestureInputSchema>;

/** The fields an update may change (at least one; else `VALIDATION`). */
export const gesturePatchSchema = z.object({
  categoryIds: gestureCategoryIdsSchema.optional(),
  description: gestureDescriptionSchema.optional(),
  keywords: gestureKeywordsSchema.optional(),
  muxAssetId: muxAssetIdSchema.nullable().optional(),
  name: gestureNameSchema.optional(),
  playbackId: playbackIdSchema.optional(),
});

export type GesturePatch = z.output<typeof gesturePatchSchema>;
export type GesturePatchInput = z.input<typeof gesturePatchSchema>;
export const GESTURE_PATCH_FIELDS = [
  "categoryIds",
  "description",
  "keywords",
  "muxAssetId",
  "name",
  "playbackId",
] as const;
export type GesturePatchField = (typeof GESTURE_PATCH_FIELDS)[number];

export const updateGestureInputSchema = gesturePatchSchema.extend({
  expectedUpdatedAt: expectedUpdatedAtSchema,
  id: catalogIdSchema,
});

export type UpdateGestureInput = z.input<typeof updateGestureInputSchema>;

export const saveManyInputSchema = z.object({
  items: z
    .array(
      z.object({
        expectedUpdatedAt: expectedUpdatedAtSchema,
        id: catalogIdSchema,
        patch: gesturePatchSchema,
      })
    )
    .min(1)
    .max(SAVE_MANY_MAX)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      { message: "each gesture at most once" }
    ),
});

export type SaveManyInput = z.input<typeof saveManyInputSchema>;

export const saveManyResultSchema = z.object({
  items: z.array(adminGestureRowSchema),
});

export const setGesturePublishedInputSchema = z.object({
  id: catalogIdSchema,
  published: z.boolean(),
});

export const bulkUpdateInputSchema = z.object({
  addCategoryIds: z
    .array(catalogIdSchema)
    .max(GESTURE_CATEGORIES_MAX)
    .optional(),
  ids: z
    .array(catalogIdSchema)
    .min(1)
    .max(BULK_UPDATE_MAX)
    .transform((ids) => [...new Set(ids)]),
  published: z.boolean().optional(),
  removeCategoryIds: z
    .array(catalogIdSchema)
    .max(GESTURE_CATEGORIES_MAX)
    .optional(),
});

export type BulkUpdateInput = z.input<typeof bulkUpdateInputSchema>;

export const bulkUpdateResultSchema = z.object({ updated: count });

export const deleteGestureInputSchema = z.object({
  /** The gesture's name, typed by the admin (trimmed, exact). */
  confirmName: z.string().trim().min(1).max(GESTURE_NAME_MAX),
  id: catalogIdSchema,
});

export const deletedResultSchema = z.object({ id: z.string() });

// --- Categories -------------------------------------------------------------

export const adminCategorySchema = z.object({
  /** Gestures in the category, published or not. */
  gestureCount: count,
  id: z.string(),
  name: z.string(),
  /** Epoch milliseconds; `null` while unpublished. */
  publishedAt: z.number().int().nullable(),
  publishedGestureCount: count,
  slug: z.string(),
  sortOrder: z.number().int(),
  /** Epoch milliseconds: pass as `expectedUpdatedAt` to `update`. */
  updatedAt: z.number().int(),
});

export type AdminCategory = z.infer<typeof adminCategorySchema>;

export const adminCategoryListSchema = z.array(adminCategorySchema);

export const createCategoryInputSchema = z.object({
  name: categoryNameSchema,
  published: z.boolean().default(true),
});

export const updateCategoryInputSchema = z.object({
  expectedUpdatedAt: expectedUpdatedAtSchema,
  id: catalogIdSchema,
  name: categoryNameSchema,
});

export const setCategoryPublishedInputSchema = z.object({
  id: catalogIdSchema,
  published: z.boolean(),
});

export const reorderCategoriesInputSchema = z.object({
  /** Every category id, in the new order. */
  ids: z.array(catalogIdSchema).min(1).max(ADMIN_CATEGORIES_MAX),
});

export const categoryIdInputSchema = z.object({ id: catalogIdSchema });
