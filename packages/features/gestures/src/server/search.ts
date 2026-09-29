/**
 * `gestures.search` (spec §7.1). At most 3 D1 round trips:
 *
 * 1. the FTS5 candidates (`"tok"*` AND, published, category filter, the
 *    best 200 by bm25) with everything the ranking and the results need;
 * 2. only for the typo tier, and only when this isolate's projection is
 *    stale: the catalog projection;
 * 3. only for typo matches on the page: their summaries.
 *
 * An empty query is the browse list and its total, in one batch.
 */
import { gesture } from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, sql } from "drizzle-orm";
import { buildFtsQuery } from "../normalize-query";
import {
  type Ranked,
  rankGestures,
  shouldRunTypoTier,
  typoMatches,
} from "../ranking";
import type { SearchResult } from "../schema";
import { type CatalogEntry, getCatalogProjection } from "./catalog-cache";
import {
  countGestures,
  findGesturesByIds,
  G,
  inCategories,
  isPublished,
  nameOrder,
  ref,
  searchableColumns,
  summaryColumns,
  toSummary,
} from "./queries";

/** FTS candidates kept for the ranking; `total` counts at most this many direct matches. */
const CANDIDATE_LIMIT = 200;

/**
 * bm25 column weights (gesture_id, name, keywords, categories, description),
 * following the ranking's field weights, so the cap keeps the best rows.
 */
const BM25 = sql.raw("bm25(gesture_fts, 0.0, 10.0, 5.0, 3.0, 1.0)");

export interface SearchInput {
  category?: string[] | undefined;
  limit: number;
  q: string;
}

export interface SearchDeps {
  db: Db;
  kv: KVNamespace;
}

interface SearchPage {
  items: SearchResult[];
  total: number;
}

async function browse(db: Db, input: SearchInput): Promise<SearchPage> {
  const [rows, [count]] = await db.batch([
    db
      .select(summaryColumns)
      .from(gesture)
      .where(and(isPublished, inCategories(input.category)))
      .orderBy(...nameOrder)
      .limit(input.limit),
    countGestures(db, input.category),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      matchedField: null,
      matchType: null,
      score: 0,
    })),
    total: count?.n ?? 0,
  };
}

function findCandidates(db: Db, fts: string, slugs: string[] | undefined) {
  // The inner `gesture` shadows the outer one, so `inCategories` (which
  // names `gesture`) filters the candidates before the bm25 cap.
  const filter = inCategories(slugs);
  const ids = sql`SELECT gesture_fts.gesture_id FROM gesture_fts JOIN ${gesture} ON ${ref(G, gesture.id)} = gesture_fts.gesture_id WHERE gesture_fts MATCH ${fts} AND ${ref(G, gesture.publishedAt)} IS NOT NULL${filter ? sql` AND ${filter}` : sql``} ORDER BY ${BM25} LIMIT ${CANDIDATE_LIMIT}`;
  return db
    .select(searchableColumns)
    .from(gesture)
    .where(sql`${gesture.id} IN (${ids})`);
}

/** Ranked search results: direct matches, then the typo tier. */
export async function searchGestures(
  { db, kv }: SearchDeps,
  input: SearchInput
): Promise<SearchPage> {
  const fts = buildFtsQuery(input.q);
  if (fts === null) {
    return await browse(db, input);
  }
  try {
    const candidates = await findCandidates(db, fts, input.category);
    const direct = rankGestures(candidates, input.q);
    let typo: Ranked<CatalogEntry>[] = [];
    if (shouldRunTypoTier(direct.length, input.q)) {
      const slugs = new Set(input.category ?? []);
      const projection = await getCatalogProjection(db, kv);
      const pool =
        slugs.size === 0
          ? projection
          : projection.filter((entry) =>
              entry.categorySlugs.some((slug) => slugs.has(slug))
            );
      typo = typoMatches(pool, input.q, {
        exclude: new Set(direct.map((result) => result.gesture.id)),
      });
    }

    const page = [...direct, ...typo].slice(0, input.limit);
    const directIds = new Set(direct.map((result) => result.gesture.id));
    const typoIds = page
      .map((result) => result.gesture.id)
      .filter((id) => !directIds.has(id));
    const hydrated = new Map(
      (await findGesturesByIds(db, typoIds)).map((row) => [row.id, row])
    );
    const byId = new Map(candidates.map((row) => [row.id, row]));

    const items = page.flatMap(({ gesture: match, ...ranking }) => {
      const candidate = byId.get(match.id);
      const summary = candidate ? toSummary(candidate) : hydrated.get(match.id);
      return summary ? [{ ...summary, ...ranking }] : [];
    });
    return { items, total: direct.length + typo.length };
  } catch (error) {
    console.error("[gestures] Failed to search gestures:", error);
    throw error;
  }
}
