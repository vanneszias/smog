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
