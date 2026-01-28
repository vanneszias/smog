import Fuse from "fuse.js";

/**
 * Type representing a searchable gesture with flexible field types
 * to support both web and native data structures
 */
export interface SearchableGesture {
  _id?: string; // Web format
  id?: string; // Native format
  name: string;
  concept: string[];
  info: string;
  categories?: Array<{ _id: string; name: string } | undefined>; // Web format
  category?: string[]; // Native format
}

/**
 * Match type indicating how the search query matched the gesture
 */
export type MatchType = "exact" | "startsWith" | "wordBoundary" | "fuzzy";

/**
 * Field where the match was found
 */
export type MatchField = "name" | "concept" | "category" | "info";

/**
 * Result of scoring a single gesture against a search query
 */
export interface ScoredGesture<T extends SearchableGesture> {
  gesture: T;
  score: number;
  matchType: MatchType;
  matchedField: MatchField;
  fuseScore?: number;
}

/**
 * Configuration options for the search algorithm
 */
export interface SearchRankingOptions {
  /**
   * Threshold for fuzzy matching (0 = perfect match, 1 = match anything)
   * Default: 0.4 (balanced between precision and recall)
   */
  fuseThreshold?: number;

  /**
   * Minimum score to include in results (filters out very poor matches)
   * Default: 0 (include all matches)
   */
  minScore?: number;

  /**
   * Enable case-sensitive bonus scoring
   * Default: true
   */
  caseSensitiveBonus?: boolean;
}

/**
 * Field weights for relevance scoring
 * Higher weight = more important for ranking
 */
const FIELD_WEIGHTS = {
  name: 100,
  concept: 50,
  category: 30,
  info: 10,
} as const;

/**
 * Match type multipliers for scoring
 * Higher multiplier = better match quality
 */
const MATCH_TYPE_MULTIPLIERS = {
  exact: 1000,
  startsWith: 500,
  wordBoundary: 250,
  fuzzy: 150,
} as const;

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize category data to string array format
 * Handles both web (array of objects) and native (array of strings) formats
 */
function normalizeCategories(gesture: SearchableGesture): {
  categories: string[];
} {
  // Web format: categories?: Array<{ _id: string; name: string } | undefined>
  if (gesture.categories) {
    return {
      categories: gesture.categories
        .filter(
          (
            cat
          ): cat is Exclude<
            (typeof gesture.categories)[number],
            null | undefined
          > => Boolean(cat)
        )
        .map((cat) => cat.name),
    };
  }

  // Native format: category?: string[]
  if (gesture.category) {
    return { categories: gesture.category };
  }

  return { categories: [] };
}

/**
 * Calculate match score for a single value against query
 */
function calculateValueMatchScore(
  value: string,
  query: string,
  queryLower: string,
  fieldWeight: number,
  caseSensitiveBonus: boolean
): { score: number; matchType: MatchType } {
  const valueLower = value.toLowerCase();
  let score = 0;
  let matchType: MatchType = "fuzzy";

  // 1. Exact match (highest priority)
  if (valueLower === queryLower) {
    score = MATCH_TYPE_MULTIPLIERS.exact * fieldWeight;
    matchType = "exact";
  }
  // 2. Starts with (high priority)
  else if (valueLower.startsWith(queryLower)) {
    score = MATCH_TYPE_MULTIPLIERS.startsWith * fieldWeight;
    matchType = "startsWith";
  }
  // 3. Word boundary match (medium-high priority)
  else if (new RegExp(`\\b${escapeRegex(queryLower)}`).test(valueLower)) {
    score = MATCH_TYPE_MULTIPLIERS.wordBoundary * fieldWeight;
    matchType = "wordBoundary";
  }

  // Apply case-sensitive bonus if enabled
  if (caseSensitiveBonus && value.includes(query)) {
    score *= 1.1;
  }

  return { score, matchType };
}

/**
 * Get search fields for a gesture
 */
function getSearchFields(gesture: SearchableGesture): Array<{
  name: MatchField;
  values: string[];
  weight: number;
}> {
  const { categories } = normalizeCategories(gesture);

  return [
    { name: "name", values: [gesture.name], weight: FIELD_WEIGHTS.name },
    {
      name: "concept",
      values: gesture.concept,
      weight: FIELD_WEIGHTS.concept,
    },
    { name: "category", values: categories, weight: FIELD_WEIGHTS.category },
    { name: "info", values: [gesture.info || ""], weight: FIELD_WEIGHTS.info },
  ];
}

/**
 * Calculate relevance score for a gesture based on search query
 * Uses exact match, starts-with, and word boundary detection
 */
function calculateExactMatchScore(
  gesture: SearchableGesture,
  query: string,
  options: Required<SearchRankingOptions>
): ScoredGesture<SearchableGesture> | null {
  const queryLower = query.toLowerCase();
  let bestScore = 0;
  let bestMatchType: MatchType = "fuzzy";
  let bestMatchedField: MatchField = "info";

  const fields = getSearchFields(gesture);

  // Check each field for matches
  for (const field of fields) {
    for (const value of field.values) {
      if (!value) {
        continue;
      }

      const { score, matchType } = calculateValueMatchScore(
        value,
        query,
        queryLower,
        field.weight,
        options.caseSensitiveBonus
      );

      // Track best score across all fields
      if (score > bestScore) {
        bestScore = score;
        bestMatchType = matchType;
        bestMatchedField = field.name;
      }
    }
  }

  // Return null if no exact/starts-with/word-boundary match found
  if (bestScore === 0) {
    return null;
  }

  return {
    gesture,
    score: bestScore,
    matchType: bestMatchType,
    matchedField: bestMatchedField,
  };
}

/**
 * Determine which field had the best match from Fuse.js results
 */
function getBestMatchedField(
  result: ReturnType<Fuse<unknown>["search"]>[number]
): MatchField {
  if (!result.matches || result.matches.length === 0) {
    return "info";
  }

  const bestMatch = result.matches[0];
  if (!bestMatch) {
    return "info";
  }

  const key = bestMatch.key as string;

  if (key === "name") {
    return "name";
  }
  if (key === "concept") {
    return "concept";
  }
  if (key === "_normalizedCategories") {
    return "category";
  }
  return "info";
}

/**
 * Process fuzzy match candidates using Fuse.js
 */
function processFuzzyMatches<T extends SearchableGesture>(
  candidates: T[],
  query: string,
  fuseThreshold: number
): ScoredGesture<T>[] {
  // Normalize categories for Fuse.js
  const normalizedGestures = candidates.map((g) => {
    const { categories } = normalizeCategories(g);
    return { ...g, _normalizedCategories: categories };
  });

  // Configure Fuse.js for fuzzy search
  const fuse = new Fuse(normalizedGestures, {
    keys: [
      { name: "name", weight: FIELD_WEIGHTS.name / 100 },
      { name: "concept", weight: FIELD_WEIGHTS.concept / 100 },
      { name: "_normalizedCategories", weight: FIELD_WEIGHTS.category / 100 },
      { name: "info", weight: FIELD_WEIGHTS.info / 100 },
    ],
    threshold: fuseThreshold,
    includeScore: true,
    includeMatches: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
    useExtendedSearch: false,
  });

  const fuseResults = fuse.search(query);
  const scoredResults: ScoredGesture<T>[] = [];

  // Convert Fuse results to our scoring format
  for (const result of fuseResults) {
    // Fuse.js score: 0 = perfect match, 1 = no match
    // Convert to our scoring system (higher = better)
    const fuseScore = 1 - (result.score ?? 1);

    const matchedField = getBestMatchedField(result);
    const fieldWeight = FIELD_WEIGHTS[matchedField];
    const score = MATCH_TYPE_MULTIPLIERS.fuzzy * fieldWeight * fuseScore;

    scoredResults.push({
      gesture: result.item as T,
      score,
      matchType: "fuzzy",
      matchedField,
      fuseScore: result.score,
    });
  }

  return scoredResults;
}

/**
 * Search and rank gestures using a hybrid approach:
 * 1. Exact matches and prefix matches (highest priority)
 * 2. Fuzzy matches for typo tolerance (fallback)
 *
 * This provides the best UX: exact matches always rank first,
 * while still supporting fuzzy search for misspellings.
 */
export function searchAndRankGestures<T extends SearchableGesture>(
  gestures: T[],
  query: string,
  options: SearchRankingOptions = {}
): ScoredGesture<T>[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  // Apply default options
  const opts: Required<SearchRankingOptions> = {
    fuseThreshold: options.fuseThreshold ?? 0.4,
    minScore: options.minScore ?? 0,
    caseSensitiveBonus: options.caseSensitiveBonus ?? true,
  };

  const trimmedQuery = query.trim();
  const scoredResults: ScoredGesture<T>[] = [];
  const fuzzyMatchCandidates: T[] = [];

  // First pass: Find exact matches, prefix matches, and word boundary matches
  for (const gesture of gestures) {
    const exactMatch = calculateExactMatchScore(gesture, trimmedQuery, opts);

    if (exactMatch) {
      scoredResults.push(exactMatch as ScoredGesture<T>);
    } else {
      // Keep track of gestures that didn't match exactly for fuzzy matching
      fuzzyMatchCandidates.push(gesture);
    }
  }

  // Second pass: Fuzzy matching for typo tolerance on remaining gestures
  if (fuzzyMatchCandidates.length > 0) {
    const fuzzyResults = processFuzzyMatches(
      fuzzyMatchCandidates,
      trimmedQuery,
      opts.fuseThreshold
    );
    scoredResults.push(...fuzzyResults);
  }

  // Filter by minimum score and sort by score (descending), then alphabetically by name
  return scoredResults
    .filter((result) => result.score >= opts.minScore)
    .sort((a, b) => {
      // Primary sort: score (descending)
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Secondary sort: alphabetical by name (ascending)
      return a.gesture.name.localeCompare(b.gesture.name);
    });
}

/**
 * Simple wrapper that returns just the gestures (without scoring metadata)
 * Useful for components that don't need the scoring details
 */
export function searchGestures<T extends SearchableGesture>(
  gestures: T[],
  query: string,
  options?: SearchRankingOptions
): T[] {
  return searchAndRankGestures(gestures, query, options).map(
    (result) => result.gesture
  );
}
