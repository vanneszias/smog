/**
 * The search ranking (spec §7.1), one pure function, run by the server on
 * the FTS5 candidates. It is platform-neutral, but no app ranks on the device
 * yet: search needs a connection (DECISIONS, "Offline search").
 *
 * - Every value goes through `normalizeQuery` (lowercase, no diacritics,
 *   words joined by one space), like the query.
 * - Direct tiers per field value: exact 1000, startsWith 500, word boundary
 *   250, times the field weight (name 100, keyword 50, category 30,
 *   description 10). The best field wins; ties sort by name with
 *   `localeCompare("nl")`.
 * - A multi-word query whose words match in different values or out of
 *   order still matches at the word-boundary tier, weighted by the field of
 *   its weakest word (FTS5 matches it, so the ranking keeps it).
 * - The typo tier (`typoMatches`) runs when fewer than 5 direct results
 *   remain and the query has at least 3 characters: similarity =
 *   1 − Damerau–Levenshtein distance / longest length against each whole
 *   value and each of its words, kept at ≥ 0.6, scored 150 × weight ×
 *   similarity and appended after the direct results without duplicates.
 */
import { normalizeQuery } from "./normalize-query";
import type { MatchField, MatchType } from "./schema";

export const FIELD_WEIGHTS = {
  category: 30,
  description: 10,
  keyword: 50,
  name: 100,
} as const satisfies Record<MatchField, number>;

export const MATCH_MULTIPLIERS = {
  exact: 1000,
  fuzzy: 150,
  startsWith: 500,
  wordBoundary: 250,
} as const satisfies Record<MatchType, number>;

/** The typo tier needs a query of at least this many characters. */
const TYPO_MIN_QUERY_LENGTH = 3;
/** The typo tier runs while there are fewer direct results than this. */
const TYPO_BELOW_RESULTS = 5;
/** The old Fuse.js threshold 0.4 as a similarity. */
const TYPO_MIN_SIMILARITY = 0.6;

/**
 * What the ranking reads. Category names may be plain strings (the catalog
 * projection) or `{ name }` objects (a `GestureSummary`).
 */
export interface SearchableGesture {
  categories?: readonly (string | { name: string })[];
  description?: string;
  id: string;
  keywords?: readonly string[];
  name: string;
}

export interface Ranked<T> {
  gesture: T;
  matchedField: MatchField;
  matchType: MatchType;
  score: number;
}

export interface RankOptions<T> {
  /**
   * Where the typo tier looks (spec §7.1 step 4); without it the tier is
   * skipped (the server runs `typoMatches` on the catalog projection itself).
   */
  typoPool?: readonly T[];
}

export interface TypoOptions {
  /** Ids already in the results (the direct matches). */
  exclude?: ReadonlySet<string>;
  minSimilarity?: number;
  /**
   * The values are already `normalizeQuery`d (the catalog snapshot), so
   * they are not normalised again: about a third of the typo pass's time.
   */
  normalized?: boolean;
}

type Fields = readonly (readonly [MatchField, readonly string[]])[];

const NL = new Intl.Collator("nl");

function same(value: string): string {
  return value;
}

/** Field values, normalised (unless they already are), heaviest field first. */
function fieldsOf(
  gesture: SearchableGesture,
  withDescription: boolean,
  normalized = false
): Fields {
  const norm = normalized ? same : normalizeQuery;
  const fields: [MatchField, string[]][] = [
    ["name", [norm(gesture.name)]],
    ["keyword", (gesture.keywords ?? []).map(norm)],
    [
      "category",
      (gesture.categories ?? []).map((item) =>
        norm(typeof item === "string" ? item : item.name)
      ),
    ],
  ];
  if (withDescription) {
    fields.push(["description", [norm(gesture.description ?? "")]]);
  }
  return fields.map(
    ([field, values]) => [field, values.filter((v) => v !== "")] as const
  );
}

function directTier(value: string, q: string): MatchType | null {
  if (value === q) {
    return "exact";
  }
  if (value.startsWith(q)) {
    return "startsWith";
  }
  return value.includes(` ${q}`) ? "wordBoundary" : null;
}

function hasWordStartingWith(value: string, token: string): boolean {
  return ` ${value}`.includes(` ${token}`);
}

type Match = Omit<Ranked<unknown>, "gesture">;

/** Every word must start a word somewhere; the weakest field sets the score. */
function spreadMatch(fields: Fields, tokens: readonly string[]): Match | null {
  let weakest: MatchField | null = null;
  for (const token of tokens) {
    const found = fields.find(([, values]) =>
      values.some((value) => hasWordStartingWith(value, token))
    );
    if (!found) {
      return null;
    }
    if (weakest === null || FIELD_WEIGHTS[found[0]] < FIELD_WEIGHTS[weakest]) {
      [weakest] = found;
    }
  }
  if (weakest === null) {
    return null;
  }
  return {
    matchedField: weakest,
    matchType: "wordBoundary",
    score: MATCH_MULTIPLIERS.wordBoundary * FIELD_WEIGHTS[weakest],
  };
}

function directMatchIn(fields: Fields, q: string): Match | null {
  let best: Match | null = null;
  for (const [field, values] of fields) {
    for (const value of values) {
      const tier = directTier(value, q);
      const score = tier ? MATCH_MULTIPLIERS[tier] * FIELD_WEIGHTS[field] : 0;
      if (tier && score > (best?.score ?? 0)) {
        best = { matchedField: field, matchType: tier, score };
      }
    }
  }
  const tokens = q.split(" ");
  return best ?? (tokens.length > 1 ? spreadMatch(fields, tokens) : null);
}

function directMatch(gesture: SearchableGesture, q: string): Match | null {
  return directMatchIn(fieldsOf(gesture, true), q);
}

/**
 * How many of `pool` match `query` directly (steps 1–3) on name, keywords
 * or categories, counting up to `stopAt`. The FTS candidates are a superset
 * of these matches (the same tokens, prefix-matched), so it is a lower
 * bound on the server's direct count.
 */
export function countDirectMatches(
  pool: readonly SearchableGesture[],
  query: string,
  {
    normalized = false,
    stopAt = Number.POSITIVE_INFINITY,
  }: { normalized?: boolean; stopAt?: number } = {}
): number {
  const q = normalizeQuery(query);
  if (q === "") {
    return 0;
  }
  let count = 0;
  for (const gesture of pool) {
    if (directMatchIn(fieldsOf(gesture, false, normalized), q)) {
      count += 1;
      if (count >= stopAt) {
        break;
      }
    }
  }
  return count;
}

function compareRanked<T extends SearchableGesture>(
  a: Ranked<T>,
  b: Ranked<T>
): number {
  return (
    b.score - a.score ||
    NL.compare(a.gesture.name, b.gesture.name) ||
    (a.gesture.id < b.gesture.id ? -1 : Number(a.gesture.id > b.gesture.id))
  );
}

/** Whether the typo tier runs after `directCount` direct results. */
export function shouldRunTypoTier(directCount: number, query: string): boolean {
  return (
    directCount < TYPO_BELOW_RESULTS &&
    normalizeQuery(query).length >= TYPO_MIN_QUERY_LENGTH
  );
}

/**
 * Ranks `candidates` for `query` (steps 1–3), then appends the typo tier
 * from `typoPool` when it applies (step 4). Non-matching candidates are
 * dropped; an empty query returns nothing (callers show the browse list).
 */
export function rankGestures<T extends SearchableGesture>(
  candidates: readonly T[],
  query: string,
  options: RankOptions<T> = {}
): Ranked<T>[] {
  const q = normalizeQuery(query);
  if (q === "") {
    return [];
  }
  const direct: Ranked<T>[] = [];
  for (const gesture of candidates) {
    const match = directMatch(gesture, q);
    if (match) {
      direct.push({ gesture, ...match });
    }
  }
  direct.sort(compareRanked);
  if (!(options.typoPool && shouldRunTypoTier(direct.length, q))) {
    return direct;
  }
  const exclude = new Set(direct.map((result) => result.gesture.id));
  return [...direct, ...typoMatches(options.typoPool, q, { exclude })];
}

/**
 * The typo tier alone (spec §7.1 step 4) over name, keywords and categories
 * (not the description). Nothing for queries under 3 characters.
 */
export function typoMatches<T extends SearchableGesture>(
  projection: readonly T[],
  query: string,
  options: TypoOptions = {}
): Ranked<T>[] {
  const q = normalizeQuery(query);
  if (q.length < TYPO_MIN_QUERY_LENGTH) {
    return [];
  }
  const min = options.minSimilarity ?? TYPO_MIN_SIMILARITY;
  const results: Ranked<T>[] = [];
  for (const gesture of projection) {
    if (options.exclude?.has(gesture.id)) {
      continue;
    }
    let best: Ranked<T> | null = null;
    for (const [field, values] of fieldsOf(
      gesture,
      false,
      options.normalized
    )) {
      for (const value of values) {
        const sim = bestSimilarity(q, value, min);
        const score = MATCH_MULTIPLIERS.fuzzy * FIELD_WEIGHTS[field] * sim;
        if (sim >= min && score > (best?.score ?? 0)) {
          best = { gesture, matchedField: field, matchType: "fuzzy", score };
        }
      }
    }
    if (best) {
      results.push(best);
    }
  }
  return results.sort(compareRanked);
}

/** The best similarity of `q` to the whole value or one of its words. */
function bestSimilarity(q: string, value: string, min: number): number {
  const words = value.includes(" ") ? [value, ...value.split(" ")] : [value];
  let best = 0;
  for (const word of words) {
    const longest = Math.max(q.length, word.length);
    // The length difference alone bounds the distance from below.
    if (longest === 0 || 1 - Math.abs(q.length - word.length) / longest < min) {
      continue;
    }
    best = Math.max(best, similarity(q, word));
  }
  return best;
}

/** 1 − distance / longest length (1 for two empty strings). */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - damerauLevenshtein(a, b) / longest;
}

/**
 * The Damerau–Levenshtein distance (optimal string alignment: insertions,
 * deletions, substitutions and adjacent transpositions each cost 1).
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  let beforePrevious = new Array<number>(b.length + 1).fill(0);
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let distance = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        distance = Math.min(distance, (beforePrevious[j - 2] ?? 0) + 1);
      }
      current[j] = distance;
    }
    [beforePrevious, previous, current] = [previous, current, beforePrevious];
  }
  return previous[b.length] ?? 0;
}

/**
 * The typo tier's matches over a normalised pool (the catalog snapshot),
 * before the direct results are known. When the pool alone has
 * `TYPO_BELOW_RESULTS` (5) direct matches, the server's direct count is at
 * least that and the tier cannot apply, so the Damerau–Levenshtein pass is
 * skipped (it is most of a search's CPU). A stale pool can at worst skip
 * the tier for a query whose matches just changed.
 */
export function typoCandidates<T extends SearchableGesture>(
  pool: readonly T[],
  query: string
): Ranked<T>[] {
  if (!shouldRunTypoTier(0, query)) {
    return [];
  }
  if (
    countDirectMatches(pool, query, {
      normalized: true,
      stopAt: TYPO_BELOW_RESULTS,
    }) >= TYPO_BELOW_RESULTS
  ) {
    return [];
  }
  return typoMatches(pool, query, { normalized: true });
}
