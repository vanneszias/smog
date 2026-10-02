/**
 * The catalog snapshot: the typo tier's projection (spec §7.1 step 4, every
 * published gesture's id, name, keywords and categories, normalised) and
 * the published categories with their counts (`gestures.categories`). It
 * lives in isolate memory and is keyed by the KV version key
 * `catalog:version`, which every gesture or category write bumps
 * (`bumpCatalogVersion`, admin in phase 5). The version is read with a 30 s
 * `cacheTtl` (KV's minimum), so other isolates see a bump within KV's
 * propagation delay plus that half minute. This only delays typo matches
 * and category counts for the change: typo matches are re-read from D1, so
 * an unpublished gesture never shows. A D1 write without a bump (a manual
 * `wrangler d1 execute`, a data import) stays invisible until the isolate
 * is recycled (a deploy recycles them all).
 *
 * Both parts load in one D1 batch, so the search page's SSR (the search,
 * then the categories) reads D1 at most twice, plus the session.
 *
 * Reads never write KV: a missing key is the fixed `INITIAL_CATALOG_VERSION`,
 * and only writers call `bumpCatalogVersion`. Only the resolved snapshot
 * (plain data) is shared between requests, never a promise: in workerd,
 * awaiting another request's I/O can hang or throw once that request ends.
 * Concurrent cold misses each load (cheap at the catalogue's size).
 */
import { gesture } from "@smog/db";
import type { Db } from "@smog/db/client";
import { newId } from "@smog/utils";
import { normalizeQuery } from "../normalize-query";
import type { SearchableGesture } from "../ranking";
import type { Category } from "../schema";
import {
  categoriesQuery,
  isPublished,
  listCategories,
  nameOrder,
  projectionColumns,
} from "./queries";

export const CATALOG_VERSION_KEY = "catalog:version";
/** The version while no writer has bumped it yet (a new namespace). */
export const INITIAL_CATALOG_VERSION = "initial";
/**
 * KV's edge cache for the version key, in seconds: KV's minimum (30 s since
 * 2026-01-30; the default is 60 s).
 */
const CATALOG_VERSION_CACHE_TTL = 30;

/** A published gesture, normalised for the typo tier. */
export interface CatalogEntry extends SearchableGesture {
  categories: string[];
  /** Published category slugs, for the category filter. */
  categorySlugs: string[];
  keywords: string[];
}

interface CatalogSnapshot {
  categories: readonly Category[];
  entries: readonly CatalogEntry[];
}

let cached: { snapshot: CatalogSnapshot; version: string } | null = null;

/**
 * Starts a new catalog version. A fresh id rather than a counter, so two
 * concurrent bumps can never leave an isolate on a stale projection under
 * a version it has already seen.
 */
export async function bumpCatalogVersion(kv: KVNamespace): Promise<string> {
  const version = newId();
  try {
    await kv.put(CATALOG_VERSION_KEY, version);
    return version;
  } catch (error) {
    console.error("[gestures] Failed to bump the catalog version:", error);
    throw error;
  }
}

async function loadSnapshot(db: Db): Promise<CatalogSnapshot> {
  const [rows, categories] = await db.batch([
    db
      .select(projectionColumns)
      .from(gesture)
      .where(isPublished)
      .orderBy(...nameOrder),
    categoriesQuery(db),
  ]);
  return {
    categories,
    entries: rows.map((row) => ({
      categories: row.categories.map((item) => normalizeQuery(item.name)),
      categorySlugs: row.categorySlugs,
      id: row.id,
      keywords: row.keywords.map(normalizeQuery),
      name: normalizeQuery(row.name),
    })),
  };
}

/**
 * The snapshot for the current `catalog:version`, loaded from D1 once per
 * isolate and version. Throws when KV or D1 fails (the callers decide how
 * to go on).
 */
async function getCatalogSnapshot(
  db: Db,
  kv: KVNamespace
): Promise<CatalogSnapshot> {
  try {
    const version =
      (await kv.get(CATALOG_VERSION_KEY, {
        cacheTtl: CATALOG_VERSION_CACHE_TTL,
      })) ?? INITIAL_CATALOG_VERSION;
    if (cached?.version === version) {
      return cached.snapshot;
    }
    const snapshot = await loadSnapshot(db);
    cached = { snapshot, version };
    return snapshot;
  } catch (error) {
    console.error("[gestures] Failed to load the catalog snapshot:", error);
    throw error;
  }
}

/** The typo tier's projection (see `getCatalogSnapshot`). */
export async function getCatalogProjection(
  db: Db,
  kv: KVNamespace
): Promise<readonly CatalogEntry[]> {
  return (await getCatalogSnapshot(db, kv)).entries;
}

/**
 * `gestures.categories`: from the snapshot, else straight from D1 when KV
 * or the snapshot load fails, so the cache never fails the categories.
 */
export async function getCatalogCategories(
  db: Db,
  kv: KVNamespace
): Promise<Category[]> {
  let snapshot: CatalogSnapshot;
  try {
    snapshot = await getCatalogSnapshot(db, kv);
  } catch {
    // getCatalogSnapshot logged it.
    return await listCategories(db);
  }
  return [...snapshot.categories];
}
