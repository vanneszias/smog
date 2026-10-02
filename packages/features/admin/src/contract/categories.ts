import { baseContract } from "@smog/rpc/contract";
import {
  adminCategoryListSchema,
  adminCategorySchema,
  categoryIdInputSchema,
  createCategoryInputSchema,
  deletedResultSchema,
  reorderCategoriesInputSchema,
  setCategoryPublishedInputSchema,
  updateCategoryInputSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";
import { CATALOG_ERRORS } from "./gestures";

const catalogContract = baseContract.errors(CATALOG_ERRORS);

/**
 * `admin.categories.*`: the category list, create, rename, publish,
 * reorder and delete (A-22). Reads come from D1 (never
 * `gestures.categories`). A rename, publish or unpublish rebuilds the
 * `gesture_fts` rows of every gesture in the category in the same batch;
 * every write bumps the catalog version.
 */
export const categoriesSlice = {
  categories: {
    /**
     * Creates a category (published by default) at the end of the order.
     * `CONFLICT` `duplicateName` for a `normalizeText`-equal name.
     */
    create: catalogContract
      .input(createCategoryInputSchema)
      .output(adminCategorySchema),
    /** Deletes an unused category (`CONFLICT` `inUse`: unpublish it instead). */
    delete: catalogContract
      .input(categoryIdInputSchema)
      .output(deletedResultSchema),
    /**
     * Every category (at most 100), published or not, by `sort_order` and
     * name, with its gesture counts.
     */
    list: baseContract.output(adminCategoryListSchema),
    /**
     * Sets `sort_order` 0..n-1 in the given order. `ids` must be exactly
     * the current categories (`INVALID_STATE` otherwise).
     */
    reorder: catalogContract
      .input(reorderCategoriesInputSchema)
      .output(adminCategoryListSchema),
    /** Publishes or unpublishes (`INVALID_STATE` when it already is). */
    setPublished: catalogContract
      .input(setCategoryPublishedInputSchema)
      .output(adminCategorySchema),
    /**
     * Renames (the slug stays). `CONFLICT` `stale` when it changed since
     * `expectedUpdatedAt`, `duplicateName` for a taken name.
     */
    update: catalogContract
      .input(updateCategoryInputSchema)
      .output(adminCategorySchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "categories.create": { audit: "category.create" },
  "categories.delete": { audit: "category.delete" },
  "categories.list": "read",
  "categories.reorder": { audit: "category.reorder" },
  "categories.setPublished": {
    audit: ["category.publish", "category.unpublish"],
  },
  "categories.update": { audit: "category.update" },
} as const satisfies AdminProcedures<typeof categoriesSlice>;
