/**
 * `@smog/gestures/contract`: the public catalogue procedures (spec §7). All
 * of them are reads for everyone; unpublished gestures and categories never
 * appear. Mounted as `gestures` in `@smog/api`'s `appContract`.
 */
import { baseContract } from "@smog/rpc/contract";
import { z } from "zod";
import {
  categorySchema,
  gestureBySlugSchema,
  gestureSummarySchema,
  searchResultSchema,
  sitemapEntrySchema,
  slugSchema,
} from "./schema";

/** Category slugs to filter by, OR semantics (any of them). */
const categoryFilterSchema = z.array(slugSchema).max(20).optional();

export const gesturesContract = {
  /** Given gestures (favorites, lists), in the order asked; unknown ids are skipped. */
  byIds: baseContract
    .input(z.object({ ids: z.array(z.string().min(1).max(64)).max(100) }))
    .output(z.array(gestureSummarySchema)),

  /** One gesture by slug, or by its legacy id (then `canonicalSlug` differs). */
  bySlug: baseContract
    .input(z.object({ slug: slugSchema }))
    .output(gestureBySlugSchema),

  /** Published categories, `sort_order` then name, at most 100. */
  categories: baseContract.output(z.array(categorySchema)),

  /** The catalogue by name, a keyset page at a time. */
  list: baseContract
    .input(
      z.object({
        category: categoryFilterSchema,
        /** `nextCursor` of the previous page. */
        cursor: z.string().min(1).max(1024).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .output(
      z.object({
        items: z.array(gestureSummarySchema),
        nextCursor: z.string().nullable(),
      })
    ),

  /** Gestures sharing a category with it: most shared first, then name. */
  related: baseContract
    .input(
      z.object({
        limit: z.number().int().min(1).max(20).default(5),
        slug: slugSchema,
      })
    )
    .output(z.array(gestureSummarySchema)),

  /**
   * Ranked search (spec §7.1): FTS5 candidates, the TS ranking, then the
   * typo tier. An empty query returns the browse list (name order).
   */
  search: baseContract
    .input(
      z.object({
        category: categoryFilterSchema,
        limit: z.number().int().min(1).max(50).default(20),
        q: z.string().max(100),
      })
    )
    .output(
      z.object({
        items: z.array(searchResultSchema),
        /** All matches (the candidates are capped at 200), not just this page. */
        total: z.number().int().nonnegative(),
      })
    ),

  /** Every published gesture, for `sitemap.xml`. */
  sitemap: baseContract.output(z.array(sitemapEntrySchema)),
};

export type GesturesContract = typeof gesturesContract;
