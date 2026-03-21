# Gesture Search Algorithm

> Last updated: March 18, 2026  
> Source: `packages/hooks/src/gestureSearchRanking.ts`

## Overview

The gesture search uses a **multi-tier ranking algorithm** that combines exact matching, prefix matching, word-boundary matching, and fuzzy matching via [Fuse.js](https://fusejs.io/).

The algorithm is designed to be:
- **Fast** — all matching runs in-memory on pre-loaded gesture data
- **Forgiving** — fuzzy matching handles minor typos (e.g. "Halo" → "Hallo")
- **Relevant** — exact matches always rank above fuzzy matches

---

## Scoring Tiers

Gestures are scored with a numeric score, then sorted descending (highest score first).

| Tier | Match Type | Score Range | Example |
|------|-----------|-------------|---------|
| 1 | Exact name match | 100 | Query "Hallo" → name "Hallo" |
| 2 | Name starts with query | 90 | Query "Hal" → name "Hallo" |
| 3 | Word-boundary in name | 75 | Query "lo" → name "Hallo" |
| 4 | Exact concept match | 85 | Query "greeting" → concept "greeting" |
| 5 | Concept starts with | 80 | Query "greet" → concept "greeting" |
| 6 | Fuzzy match via Fuse.js | 10–50 | Query "Halo" → name "Hallo" |

Scores within each tier are adjusted by the Fuse.js score (`fuseScore`) for fine-grained ranking within the tier.

---

## Search Fields

The algorithm searches these fields in priority order:

1. **`name`** — gesture name (highest priority)
2. **`concept`** — related concepts / synonyms
3. **`info`** — description text
4. **`category`** / **`categories`** — category names (supports both native and web formats)

---

## Algorithm Steps

```
Input: gestures[], query string
Output: ScoredGesture[] sorted by score descending

1. Normalise query to lowercase

2. For each gesture:
   a. Check exact name match → score 100 (or 95 if case-insensitive)
   b. Check name starts-with → score 90
   c. Check name word-boundary → score 75
   d. Check concept exact match → score 85
   e. Check concept starts-with → score 80
   f. If no direct match found → use Fuse.js → score 10–50

3. Filter out gestures below minScore threshold (default: 0)

4. Sort by score descending

5. Return gesture objects (not the score wrappers)
```

---

## Fuse.js Configuration

```typescript
const fuseOptions = {
  keys: [
    { name: "name", weight: 0.5 },
    { name: "concept", weight: 0.3 },
    { name: "info", weight: 0.1 },
    { name: "categories.name", weight: 0.1 },
  ],
  threshold: 0.4,        // 0 = exact, 1 = match anything
  includeScore: true,    // needed for score-based ranking
  minMatchCharLength: 2, // ignore single-character matches
};
```

The `threshold: 0.4` is balanced to allow one-character typos (e.g. "Halo" → "Hallo") while avoiding false positives for short queries.

---

## Data Format Support

The algorithm handles both native and web gesture shapes:

```typescript
// Native format
{ id: string; category: string[]; ... }

// Web format
{ _id: string; categories: { _id: string; name: string }[]; ... }
```

The `SearchableGesture` interface accepts both via optional fields.

---

## Performance Characteristics

| Data Size | Query Time |
|-----------|-----------|
| ~500 gestures | < 5ms |
| ~5,000 gestures | < 50ms |

The search runs entirely in-memory on pre-loaded gesture data. Fuse.js builds an index on the first search and reuses it for subsequent queries on the same gesture array.

**Important:** Always pass a stable gesture array reference. If the array reference changes on every render, Fuse.js rebuilds its index on every keystroke.

---

## Usage

```typescript
import { searchGestures } from "@smog/hooks";

// Returns ScoredGesture[] sorted by relevance
const results = searchGestures(allGestures, "Hallo");

// In useGestureFiltering (web):
// Called only when searchQuery is non-empty; empty query shows all gestures
if (searchQuery.trim().length > 0) {
  filtered = searchGestures(filtered, searchQuery) as T[];
}

// In useOptimizedSearch (native):
// Called when query meets minSearchLength (default: 2 chars)
if (query.length >= minSearchLength) {
  filtered = searchGestures(filtered, query) as Gesture[];
}
```

---

## Test Coverage

`packages/hooks/src/__tests__/gestureSearchRanking.test.ts` covers:
- Empty gesture list
- Exact name match
- Case-insensitivity
- Concept field matching
- Info field matching
- Relevance ranking (name match beats concept match)
- No-match queries
- Fuzzy matching for minor typos
