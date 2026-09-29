/**
 * The typo tier's catalog projection (spec §7.1 step 4): every published
 * gesture's id, name, keywords and categories, normalised. It lives in
 * isolate memory and is keyed by the KV version key `catalog:version`,
 * which every gesture or category write bumps (`bumpCatalogVersion`, admin
 * in phase 5). Other isolates see a bump within KV's propagation delay
 * (up to a minute), which only delays typo matches for the change.
 *
 * Reads never write KV: a missing key is the fixed `INITIAL_CATALOG_VERSION`,
 * and only writers call `bumpCatalogVersion`. Concurrent cold loads in one
 * isolate share one D1 query.
 */
import { gesture } from "@smog/db";
import type { Db } from "@smog/db/client";
import { newId } from "@smog/utils";
import { normalizeQuery } from "../normalize-query";
import type { SearchableGesture } from "../ranking";
import { isPublished, nameOrder, projectionColumns } from "./queries";

export const CATALOG_VERSION_KEY = "catalog:version";
/** The version while no writer has bumped it yet (a new namespace). */
export const INITIAL_CATALOG_VERSION = "initial";

/** A published gesture, normalised for the typo tier. */
export interface CatalogEntry extends SearchableGesture {
  categories: string[];
  /** Published category slugs, for the category filter. */
  categorySlugs: string[];
  keywords: string[];
}

let cached: { entries: readonly CatalogEntry[]; version: string } | null = null;
/** The load in flight, per version, so concurrent cold requests share it. */
let loading: {
  entries: Promise<readonly CatalogEntry[]>;
  version: string;
} | null = null;

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

async function loadProjection(db: Db): Promise<CatalogEntry[]> {
  const rows = await db
    .select(projectionColumns)
    .from(gesture)
    .where(isPublished)
    .orderBy(...nameOrder);
  return rows.map((row) => ({
    categories: row.categories.map((item) => normalizeQuery(item.name)),
    categorySlugs: row.categorySlugs,
    id: row.id,
    keywords: row.keywords.map(normalizeQuery),
    name: normalizeQuery(row.name),
  }));
}

function loadOnce(db: Db, version: string): Promise<readonly CatalogEntry[]> {
  if (loading?.version === version) {
    return loading.entries;
  }
  const entries = loadProjection(db).then((loaded) => {
    cached = { entries: loaded, version };
    return loaded;
  });
  const current = { entries, version };
  loading = current;
  const clear = () => {
    if (loading === current) {
      loading = null;
    }
  };
  entries.then(clear, clear);
  return entries;
}

/**
 * The projection for the current `catalog:version`, loaded from D1 once
 * per isolate and version. Throws when KV or D1 fails (the caller decides
 * whether to go on without the typo tier).
 */
export async function getCatalogProjection(
  db: Db,
  kv: KVNamespace
): Promise<readonly CatalogEntry[]> {
  try {
    const version =
      (await kv.get(CATALOG_VERSION_KEY)) ?? INITIAL_CATALOG_VERSION;
    if (cached?.version === version) {
      return cached.entries;
    }
    return await loadOnce(db, version);
  } catch (error) {
    console.error("[gestures] Failed to load the catalog projection:", error);
    throw error;
  }
}
