/**
 * Catalogue reads. Every query is public: published gestures and published
 * categories only (`published_at IS NOT NULL`), bounded, one D1 round trip
 * each. Summaries share one column set, so the sponsored-video override and
 * the category order are the same in every list.
 */
import {
  category,
  gesture,
  gestureCategory,
  gestureKeyword,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { decodeCursorAs, encodeCursor } from "@smog/utils";
import { and, eq, isNotNull, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type {
  Category,
  CategoryRef,
  GestureBySlug,
  GestureSummary,
  SitemapEntry,
} from "../schema";

/** At most this many categories (the filter chips and the menu). */
const CATEGORY_LIMIT = 100;
/** The sitemap protocol's limit per file. */
const SITEMAP_LIMIT = 50_000;
/** Sponsorships whose video and credit are shown (spec §5.4). */
const RUNNING_STATUSES = sql.raw("'live', 'expiring'");

/**
 * `alias."column"`. Drizzle renders columns unqualified in single-table
 * selects, so a correlated subquery must name both sides itself: the outer
 * row is always `gesture` (`G`), inner tables get their own alias.
 */
export function ref(alias: string, column: SQLiteColumn): SQL {
  return sql`${sql.raw(alias)}.${sql.identifier(column.name)}`;
}

/** The outer row's name in every catalogue query (the `gesture` table). */
export const G = "gesture";

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

export const isPublished: SQL = isNotNull(gesture.publishedAt);

/** The running sponsorship's video, else the gesture's own. */
const playbackIdColumn = sql<string>`coalesce((SELECT ${ref("s", sponsorship.videoPlaybackId)} FROM ${sponsorship} AS s WHERE ${ref("s", sponsorship.gestureId)} = ${ref(G, gesture.id)} AND ${ref("s", sponsorship.status)} IN (${RUNNING_STATUSES}) AND ${ref("s", sponsorship.videoPlaybackId)} IS NOT NULL), ${ref(G, gesture.playbackId)})`;

/** Published categories as JSON, in category order (`sort_order`, name). */
const categoriesColumn =
  sql`(SELECT json_group_array(json_object('name', o.name, 'slug', o.slug)) FROM (SELECT ${ref("c", category.name)} AS name, ${ref("c", category.slug)} AS slug FROM ${gestureCategory} AS gc JOIN ${category} AS c ON ${ref("c", category.id)} = ${ref("gc", gestureCategory.categoryId)} WHERE ${ref("gc", gestureCategory.gestureId)} = ${ref(G, gesture.id)} AND ${ref("c", category.publishedAt)} IS NOT NULL ORDER BY ${ref("c", category.sortOrder)}, ${ref("c", category.name)} COLLATE NOCASE) AS o)`.mapWith(
    parseJson<CategoryRef[]>
  );

/** Keywords as JSON, in the editor's order. */
const keywordsColumn =
  sql`(SELECT json_group_array(o.keyword) FROM (SELECT ${ref("k", gestureKeyword.keyword)} AS keyword FROM ${gestureKeyword} AS k WHERE ${ref("k", gestureKeyword.gestureId)} = ${ref(G, gesture.id)} ORDER BY ${ref("k", gestureKeyword.position)}) AS o)`.mapWith(
    parseJson<string[]>
  );

/** Published category slugs as JSON (the typo tier's category filter). */
const categorySlugsColumn =
  sql`(SELECT json_group_array(${ref("c", category.slug)}) FROM ${gestureCategory} AS gc JOIN ${category} AS c ON ${ref("c", category.id)} = ${ref("gc", gestureCategory.categoryId)} WHERE ${ref("gc", gestureCategory.gestureId)} = ${ref(G, gesture.id)} AND ${ref("c", category.publishedAt)} IS NOT NULL)`.mapWith(
    parseJson<string[]>
  );

export const summaryColumns = {
  categories: categoriesColumn,
  id: gesture.id,
  name: gesture.name,
  playbackId: playbackIdColumn,
  slug: gesture.slug,
};

/** A summary plus what the ranking reads. */
export const searchableColumns = {
  ...summaryColumns,
  description: gesture.description,
  keywords: keywordsColumn,
};

export const projectionColumns = {
  categories: categoriesColumn,
  categorySlugs: categorySlugsColumn,
  id: gesture.id,
  keywords: keywordsColumn,
  name: gesture.name,
};

/**
 * The public catalogue order: `sort_name` (`gestureSortName`: lowercase, no
 * accents), then id; `gesture_published_sort_name_idx` serves it.
 */
export const nameOrder: SQL[] = [sql`${gesture.sortName}`, sql`${gesture.id}`];

/**
 * Gestures in any of the published categories `slugs` (OR); no filter when
 * `slugs` is empty. One bound parameter however many slugs.
 */
export function inCategories(
  slugs: readonly string[] | undefined
): SQL | undefined {
  if (!slugs || slugs.length === 0) {
    return;
  }
  return sql`${ref(G, gesture.id)} IN (SELECT ${ref("gc", gestureCategory.gestureId)} FROM ${gestureCategory} AS gc JOIN ${category} AS c ON ${ref("c", category.id)} = ${ref("gc", gestureCategory.categoryId)} WHERE ${ref("c", category.publishedAt)} IS NOT NULL AND ${ref("c", category.slug)} IN (SELECT value FROM json_each(${JSON.stringify(slugs)})))`;
}

export function toSummary(row: GestureSummary): GestureSummary {
  return {
    categories: row.categories,
    id: row.id,
    name: row.name,
    playbackId: row.playbackId,
    slug: row.slug,
  };
}

interface ListInput {
  category?: string[] | undefined;
  cursor?: string | undefined;
  limit: number;
}

/** The last row of a page: the keyset position the next page starts after. */
interface ListPosition {
  id: string;
  sortName: string;
}

/** `InvalidCursorError` (`@smog/utils`) for a cursor `list` did not issue. */
function parseListCursor(cursor: string): ListPosition {
  return decodeCursorAs(cursor, (key) => {
    const [sortName, id] = key;
    return key.length === 2 &&
      typeof sortName === "string" &&
      typeof id === "string"
      ? { id, sortName }
      : null;
  });
}

/**
 * After `(sort_name, id)` in the list order. Written as a range on the
 * first key, so SQLite seeks the index instead of scanning it (it scans for
 * the row-value form `(sort_name, id) > (?, ?)`).
 */
function after(position: ListPosition): SQL {
  const key = sql`${gesture.sortName}`;
  return sql`${key} >= ${position.sortName} AND (${key} > ${position.sortName} OR ${gesture.id} > ${position.id})`;
}

/** The list query: a page (plus one row, to know there is more). */
export function listGesturesQuery(
  db: Db,
  slugs: readonly string[] | undefined,
  position: ListPosition | null,
  limit: number
) {
  return db
    .select({ ...summaryColumns, sortName: gesture.sortName })
    .from(gesture)
    .where(
      and(
        isPublished,
        inCategories(slugs),
        position ? after(position) : undefined
      )
    )
    .orderBy(...nameOrder)
    .limit(limit + 1);
}

/** A page of the catalogue in name order (`InvalidCursorError` for a bad cursor). */
export async function listGestures(
  db: Db,
  input: ListInput
): Promise<{ items: GestureSummary[]; nextCursor: string | null }> {
  const position =
    input.cursor === undefined ? null : parseListCursor(input.cursor);
  try {
    const rows = await listGesturesQuery(
      db,
      input.category,
      position,
      input.limit
    );
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      items: page.map(toSummary),
      nextCursor:
        rows.length > input.limit && last
          ? encodeCursor([last.sortName, last.id])
          : null,
    };
  } catch (error) {
    console.error("[gestures] Failed to list gestures:", error);
    throw error;
  }
}

/** The number of published gestures in the filter (the browse total). */
export function countGestures(db: Db, slugs: readonly string[] | undefined) {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(gesture)
    .where(and(isPublished, inCategories(slugs)));
}

/**
 * One gesture by slug, else by legacy id (a slug wins over another
 * gesture's legacy id), with its running sponsorship. `null` when unknown
 * or unpublished.
 */
export async function findGestureBySlug(
  db: Db,
  slug: string
): Promise<GestureBySlug | null> {
  try {
    const [row] = await db
      .select({
        ...searchableColumns,
        publishedAt: gesture.publishedAt,
        sponsorName: sponsorship.displayName,
        sponsorUntil: sponsorship.endsAt,
        updatedAt: gesture.updatedAt,
      })
      .from(gesture)
      .leftJoin(
        sponsorship,
        and(
          eq(sponsorship.gestureId, gesture.id),
          sql`${sponsorship.status} IN (${RUNNING_STATUSES})`
        )
      )
      .where(
        and(
          isPublished,
          sql`(${gesture.slug} = ${slug} OR ${gesture.legacyId} = ${slug})`
        )
      )
      .orderBy(sql`${gesture.slug} = ${slug} DESC`)
      .limit(1);
    if (!row) {
      return null;
    }
    const { publishedAt, sponsorName, sponsorUntil, updatedAt, ...detail } =
      row;
    return {
      ...detail,
      canonicalSlug: detail.slug,
      // `isPublished` guarantees the date; the fallback only satisfies the type.
      publishedAt: (publishedAt ?? updatedAt).getTime(),
      sponsor:
        sponsorName !== null && sponsorUntil !== null
          ? { name: sponsorName, until: sponsorUntil.getTime() }
          : null,
      updatedAt: updatedAt.getTime(),
    };
  } catch (error) {
    console.error("[gestures] Failed to find a gesture by slug:", error);
    throw error;
  }
}

/** The published gestures among `ids` as summaries, in no order (one read). */
export function gesturesByIdsQuery(db: Db, ids: readonly string[]) {
  return db
    .select(summaryColumns)
    .from(gesture)
    .where(
      and(
        isPublished,
        sql`${gesture.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`
      )
    );
}

/** Published gestures by id, in the order given (duplicates and unknown ids dropped). */
export async function findGesturesByIds(
  db: Db,
  ids: readonly string[]
): Promise<GestureSummary[]> {
  if (ids.length === 0) {
    return [];
  }
  try {
    const rows = await gesturesByIdsQuery(db, ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return [...new Set(ids)].flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  } catch (error) {
    console.error("[gestures] Failed to find gestures by id:", error);
    throw error;
  }
}

/**
 * Published gestures sharing at least one published category with `slug`:
 * the most shared categories first, then by name. Empty for an unknown slug.
 */
export async function findRelatedGestures(
  db: Db,
  slug: string,
  limit: number
): Promise<GestureSummary[]> {
  const source = sql`(SELECT ${ref("s", gesture.id)} FROM ${gesture} AS s WHERE ${ref("s", gesture.slug)} = ${slug} AND ${ref("s", gesture.publishedAt)} IS NOT NULL)`;
  try {
    return await db
      .select(summaryColumns)
      .from(gestureCategory)
      .innerJoin(gesture, eq(gesture.id, gestureCategory.gestureId))
      .innerJoin(category, eq(category.id, gestureCategory.categoryId))
      .where(
        and(
          isPublished,
          isNotNull(category.publishedAt),
          sql`${gestureCategory.categoryId} IN (SELECT ${ref("gc", gestureCategory.categoryId)} FROM ${gestureCategory} AS gc WHERE ${ref("gc", gestureCategory.gestureId)} = ${source})`,
          sql`${gesture.id} <> ${source}`
        )
      )
      .groupBy(gesture.id)
      .orderBy(sql`count(*) DESC`, ...nameOrder)
      .limit(limit);
  } catch (error) {
    console.error("[gestures] Failed to find related gestures:", error);
    throw error;
  }
}

/** Published categories (`sort_order`, name) with their published gesture counts. */
export function categoriesQuery(db: Db) {
  return db
    .select({
      gestureCount: sql<number>`(SELECT count(*) FROM ${gestureCategory} AS gc JOIN ${gesture} AS g ON ${ref("g", gesture.id)} = ${ref("gc", gestureCategory.gestureId)} WHERE ${ref("gc", gestureCategory.categoryId)} = ${ref("category", category.id)} AND ${ref("g", gesture.publishedAt)} IS NOT NULL)`,
      name: category.name,
      slug: category.slug,
    })
    .from(category)
    .where(isNotNull(category.publishedAt))
    .orderBy(category.sortOrder, sql`${category.name} COLLATE NOCASE`)
    .limit(CATEGORY_LIMIT);
}

/**
 * The categories straight from D1. `gestures.categories` serves them from
 * the catalog snapshot (`getCatalogCategories`) and falls back to this.
 */
export async function listCategories(db: Db): Promise<Category[]> {
  try {
    return await categoriesQuery(db);
  } catch (error) {
    console.error("[gestures] Failed to list categories:", error);
    throw error;
  }
}

/** Every published gesture's slug and last update, for `sitemap.xml`. */
export async function listSitemap(db: Db): Promise<SitemapEntry[]> {
  try {
    const rows = await db
      .select({ slug: gesture.slug, updatedAt: gesture.updatedAt })
      .from(gesture)
      .where(isPublished)
      .orderBy(...nameOrder)
      .limit(SITEMAP_LIMIT);
    return rows.map((row) => ({
      slug: row.slug,
      updatedAt: row.updatedAt.getTime(),
    }));
  } catch (error) {
    console.error("[gestures] Failed to list the sitemap:", error);
    throw error;
  }
}
