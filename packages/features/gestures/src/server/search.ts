/**
 * `gestures.search` (spec §7.1). At most 2 D1 round trips:
 *
 * 1. only for a query long enough for the typo tier, and only when this
 *    isolate's catalog snapshot is stale: the snapshot (projection and
 *    categories, one batch);
 * 2. one batch: the FTS5 candidates (`"tok"*` AND, published, category
 *    filter, the best 200 by bm25) with everything the ranking and the
 *    results need, and the summaries of the page's possible typo matches
 *    (published only, so a stale projection never shows an unpublished
 *    gesture).
 *
 * An empty query is the browse list and its total, in one batch.
 *
 * Phase 10b: the search takes the viewer's language (see `ftsLocaleFilter`);
 * the typo tier reads that language's projection and the ties sort with its
 * collation. The browse order stays the default language's `sort_name`.
 */
import { DEFAULT_LANGUAGE_SQL, gesture, ref } from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, sql } from "drizzle-orm";
import { buildFtsQuery } from "../normalize-query";
import {
  type Ranked,
  rankGestures,
  shouldRunTypoTier,
  typoCandidates,
} from "../ranking";
import type { SearchResult } from "../schema";
import { type CatalogEntry, getCatalogProjection } from "./catalog-cache";
import { G } from "./localized";
import {
  countGestures,
  DEFAULT_LOCALE,
  gesturesByIdsQuery,
  inCategories,
  isPublished,
  nameOrder,
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

/**
 * `gesture_fts` holds one row per (gesture, language) since migration 0022.
 * A search in a language reads that language's rows, and the default
 * language's row of every gesture that has no translation into it (spec
 * 5.4: an untranslated gesture is still found by its Dutch name, shown in
 * Dutch and flagged `fallbackUsed`). The translation table decides, by its
 * primary key, so the virtual table is never scanned for the fallback; a
 * translation write rebuilds the rows in the same batch, so a translation
 * row and its index row exist together.
 */
function ftsLocaleFilter(locale: string) {
  return sql`(gesture_fts.locale = ${locale} OR (gesture_fts.locale = ${DEFAULT_LANGUAGE_SQL} AND NOT EXISTS (SELECT 1 FROM gesture_translation AS gt WHERE gt.gesture_id = gesture_fts.gesture_id AND gt.locale = ${locale})))`;
}

export interface SearchInput {
  category?: string[] | undefined;
  limit: number;
  q: string;
}

export interface SearchDeps {
  db: Db;
  kv: KVNamespace;
  /** The viewer's language (default `nl`): the rows searched, the names shown, the collation. */
  locale?: string | undefined;
}

interface SearchPage {
  items: SearchResult[];
  total: number;
}

async function browse(
  db: Db,
  input: SearchInput,
  locale: string
): Promise<SearchPage> {
  const [rows, [count]] = await db.batch([
    db
      .select(summaryColumns(locale))
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

function findCandidates(
  db: Db,
  fts: string,
  slugs: string[] | undefined,
  locale: string
) {
  // The inner `gesture` shadows the outer one, so `inCategories` (which
  // names `gesture`) filters the candidates before the bm25 cap.
  const filter = inCategories(slugs);
  const ids = sql`SELECT gesture_fts.gesture_id FROM gesture_fts JOIN ${gesture} ON ${ref(G, gesture.id)} = gesture_fts.gesture_id WHERE gesture_fts MATCH ${fts} AND ${ftsLocaleFilter(locale)} AND ${ref(G, gesture.publishedAt)} IS NOT NULL${filter ? sql` AND ${filter}` : sql``} ORDER BY ${BM25} LIMIT ${CANDIDATE_LIMIT}`;
  return db
    .select(searchableColumns(locale))
    .from(gesture)
    .where(sql`${gesture.id} IN (${ids})`);
}

/**
 * The typo tier's matches (step 4) from the catalog projection, before the
 * direct ones are known: best first, category filter applied, nothing
 * excluded yet. Empty when the projection alone has 5 direct matches (the
 * tier cannot apply; `typoCandidates` in the ranking). It is best effort: a
 * KV or D1 failure is logged and the search answers with its direct
 * matches instead of failing.
 */
async function typoTier(
  { db, kv }: SearchDeps,
  input: SearchInput,
  locale: string
): Promise<Ranked<CatalogEntry>[]> {
  // Too short for a typo match, whatever the direct results.
  if (!shouldRunTypoTier(0, input.q)) {
    return [];
  }
  let projection: readonly CatalogEntry[];
  try {
    projection = await getCatalogProjection(db, kv, locale);
  } catch (error) {
    console.error(
      "[gestures] Failed to load the typo tier, answering with direct matches:",
      error
    );
    return [];
  }
  const slugs = new Set(input.category ?? []);
  const pool =
    slugs.size === 0
      ? projection
      : projection.filter((entry) =>
          entry.categorySlugs.some((slug) => slugs.has(slug))
        );
  return typoCandidates(pool, input.q, locale);
}

/**
 * Ranked search results: direct matches, then the typo tier. The typo
 * matches are computed first (from isolate memory), so their summaries are
 * read in the same D1 batch as the FTS candidates. The first `limit` typo
 * matches are enough: the page needs `limit - direct` typo matches, and at
 * most `direct` of the first `limit` are direct matches themselves (dropped
 * after the batch), so the rest still fill the page.
 */
export async function searchGestures(
  { db, kv, locale = DEFAULT_LOCALE }: SearchDeps,
  input: SearchInput
): Promise<SearchPage> {
  const fts = buildFtsQuery(input.q);
  if (fts === null) {
    return await browse(db, input, locale);
  }
  try {
    const typoAll = await typoTier({ db, kv }, input, locale);
    const typoPage = typoAll
      .slice(0, input.limit)
      .map((result) => result.gesture.id);
    const candidatesQuery = findCandidates(db, fts, input.category, locale);
    const [candidates, typoRows] =
      typoPage.length > 0
        ? await db.batch([
            candidatesQuery,
            gesturesByIdsQuery(db, typoPage, locale),
          ])
        : [await candidatesQuery, []];

    const direct = rankGestures(candidates, input.q, { locale });
    const directIds = new Set(direct.map((result) => result.gesture.id));
    const typo = shouldRunTypoTier(direct.length, input.q)
      ? typoAll.filter((result) => !directIds.has(result.gesture.id))
      : [];

    const page = [...direct, ...typo].slice(0, input.limit);
    const hydrated = new Map(typoRows.map((row) => [row.id, row]));
    const byId = new Map(candidates.map((row) => [row.id, row]));
    const items = page.flatMap(({ gesture: match, ...ranking }) => {
      const candidate = byId.get(match.id);
      const summary = candidate ? toSummary(candidate) : hydrated.get(match.id);
      return summary ? [{ ...summary, ...ranking }] : [];
    });
    // A typo match from a stale projection may be unpublished by now.
    const vanished = page.filter(
      (result) =>
        !(byId.has(result.gesture.id) || hydrated.has(result.gesture.id))
    ).length;
    return { items, total: direct.length + typo.length - vanished };
  } catch (error) {
    console.error("[gestures] Failed to search gestures:", error);
    throw error;
  }
}
