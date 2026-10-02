/**
 * `/gestures` search params (spec §9): `?q=` (the query), `?category=`
 * (comma-separated slugs, OR semantics) and, on desktop, `?selected=` (the
 * gesture shown beside the results, masked as `/gestures/<slug>`).
 */
export interface GesturesSearch {
  category?: string;
  q?: string;
  selected?: string;
}

/** The contract's limits: a query of at most 100, at most 20 categories. */
const Q_MAX = 100;
const CATEGORIES_MAX = 20;
const SLUG_MAX = 120;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return;
  }
  const trimmed = String(value).trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Category slugs from `?category=a,b` (deduped, empty parts dropped). */
export function parseCategories(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const slugs = value
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0 && slug.length <= SLUG_MAX);
  return [...new Set(slugs)].slice(0, CATEGORIES_MAX);
}

/** `?category=` for these slugs (`undefined` for none). */
export function formatCategories(slugs: readonly string[]): string | undefined {
  return slugs.length > 0 ? slugs.join(",") : undefined;
}

/** Keeps the known params, trimmed and bounded; drops empty ones. */
export function validateGesturesSearch(
  search: Record<string, unknown>
): GesturesSearch {
  const q = text(search.q, Q_MAX);
  const category = formatCategories(
    parseCategories(text(search.category, CATEGORIES_MAX * (SLUG_MAX + 1)))
  );
  const selected = text(search.selected, SLUG_MAX);
  return {
    ...(q ? { q } : {}),
    ...(category ? { category } : {}),
    ...(selected ? { selected } : {}),
  };
}
