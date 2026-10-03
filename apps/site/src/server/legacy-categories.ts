import { createDb } from "@smog/db/client";
import { getCatalogCategories } from "@smog/gestures/server";
import { slugify } from "@smog/utils";
import type { CategorySlugs } from "@/lib/legacy-redirects";
import { siteEnv } from "./auth";

/**
 * The published categories' slugs by `slugify(name)`, for old
 * `?category=<Name>` links (the catalog snapshot in KV, else D1).
 */
export async function loadCategorySlugs(): Promise<CategorySlugs> {
  const { db, kv } = siteEnv();
  const categories = await getCatalogCategories(createDb(db), kv);
  return new Map(
    categories.map((category) => [slugify(category.name), category.slug])
  );
}

/** Ids, legacy ids and slugs are short; anything longer is no gesture. */
const GESTURE_REF = /^[\w-]{1,120}$/;

/**
 * The slug of the published gesture an old `?gestureId=` names: its id,
 * its legacy (Convex) id or its slug (R-11). One indexed D1 read; `null`
 * for an unknown or unpublished gesture.
 */
export async function loadGestureSlug(value: string): Promise<string | null> {
  if (!GESTURE_REF.test(value)) {
    return null;
  }
  const row = await siteEnv()
    .db.prepare(
      "SELECT slug FROM gesture WHERE published_at IS NOT NULL AND (id = ?1 OR legacy_id = ?1 OR slug = ?1) LIMIT 1"
    )
    .bind(value)
    .first<{ slug: string }>();
  return row?.slug ?? null;
}
