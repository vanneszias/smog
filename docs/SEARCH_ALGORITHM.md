# Gesture Search

> Last updated: June 10, 2026

SMOG currently has two search paths.

## Native

`apps/native/hooks/useGestureData.ts` calls the Convex
`gestures.searchForNative` query. `useOptimizedSearch` debounces the query and
category filters, requests additional results as the visible page grows, and
exposes loading and timing state.

Search input is sent to Convex to return results, but analytics receives only
query length, category count, result count, and whether results exist.

## Web Filtering

`@smog/hooks` provides `searchGestures` and `useGestureFiltering` for lists that
are already loaded in the browser.

The ranking algorithm:

1. normalizes the query for case-insensitive comparison;
2. checks exact, starts-with, and word-boundary matches;
3. weights fields as name (100), concept (50), category (30), info (10);
4. applies match multipliers: exact (1000), starts-with (500),
   word-boundary (250), fuzzy (150);
5. gives a small case-sensitive inclusion bonus when enabled;
6. uses Fuse.js for gestures without a direct match;
7. sorts the resulting `ScoredGesture` values by score.

Default fuzzy threshold is `0.4`. The search shape supports web category
objects and native category strings, although the current native browsing path
uses the Convex query rather than this in-memory function.

## Category Filtering

Web `useGestureFiltering` matches a gesture when any selected category is
present, then applies relevance search. With no text query, results are sorted
by name or first category according to the selected direction.

## Tests

`packages/hooks/src/__tests__/gestureSearchRanking.test.ts` covers empty input,
case handling, field matches, ranking, missing results, and typo-tolerant fuzzy
matches.
